// One tenant's SMS delivery sweep, enqueued every 30 minutes by
// cron/sms-delivery-sweep.ts. See docs/specs/0004-sms-send-flow, "Webhook and
// sweep", AC-13 and AC-16. NextSMS never retries its webhook, so this is what
// makes delivery status converge anyway, and what un-sticks a send that died
// halfway. Every step only touches rows still in the state it expects, so an
// overlapping run is harmless.

import { and, asc, eq, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm'
import type { Env } from '../types'
import { smsCampaigns, smsDeliveryEvents, smsMessages } from '../../../drizzle/tenant/schema'
import { getTenantDbForOrg, type TenantDb } from '../lib/tenant-db'
import { loadSmsSettings, type LoadedSmsSettings } from '../lib/sms-settings'
import { mapReportStatus } from '../lib/nextsms'
import { finaliseCampaign, type SmsSendMessage } from './send-sms'

export interface SmsSweepMessage {
  orgId: string
}

const MINUTE_MS = 60_000
const POLL_MIN_AGE_MS = 15 * MINUTE_MS
const POLL_MAX_AGE_MS = 72 * 60 * MINUTE_MS
// NextSMS's /reports takes at most 200 ids per call.
const POLL_BATCH = 200
const REENQUEUE_AFTER_MS = 10 * MINUTE_MS
const SENDING_TIMEOUT_MS = 2 * 60 * MINUTE_MS

// Least recently checked first (never checked before anything), so with more
// pending than one call can cover, every message still gets its turn.
async function pollReports(db: TenantDb, settings: LoadedSmsSettings): Promise<number> {
  const now = Date.now()
  const due = await db
    .select({ id: smsMessages.id, providerMessageId: smsMessages.providerMessageId })
    .from(smsMessages)
    .where(and(
      eq(smsMessages.status, 'SENT'),
      isNotNull(smsMessages.providerMessageId),
      sql`${smsMessages.sentAt} BETWEEN ${new Date(now - POLL_MAX_AGE_MS)} AND ${new Date(now - POLL_MIN_AGE_MS)}`,
    ))
    .orderBy(sql`${smsMessages.lastPolledAt} ASC NULLS FIRST`, asc(smsMessages.sentAt))
    .limit(POLL_BATCH)
  if (due.length === 0) return 0

  // Marked before asking, so a failed call still moves these to the back of the line.
  await db.update(smsMessages).set({ lastPolledAt: new Date() }).where(inArray(smsMessages.id, due.map((m) => m.id)))

  const reports = await settings.client.getReports(due.map((m) => m.providerMessageId!))
  if (!reports.ok) return 0

  const idByProvider = new Map(due.map((m) => [m.providerMessageId!, m.id]))
  const updates: { id: string; outcome: string | null; providerStatus: string; doneAt: string | null }[] = []
  const events: (typeof smsDeliveryEvents.$inferInsert)[] = []
  for (const report of reports.data.results ?? []) {
    const id = idByProvider.get(String(report.messageId))
    const name = report.status?.name ?? report.status?.groupName
    if (!id || !name) continue
    events.push({ messageId: id, status: name, rawPayload: report, source: 'poll' })
    updates.push({
      id,
      outcome: mapReportStatus(report.status?.name, report.status?.groupName),
      providerStatus: name,
      doneAt: report.doneAt ?? null,
    })
  }
  if (events.length > 0) await db.insert(smsDeliveryEvents).values(events)
  if (updates.length > 0) {
    const values = sql.join(
      updates.map((u) => sql`(${u.id}::uuid, ${u.outcome}::text, ${u.providerStatus}::text, ${u.doneAt}::text)`),
      sql`, `,
    )
    // A final status is never overwritten; "no change" outcomes only record
    // the raw provider status.
    await db.execute(sql`
      UPDATE sms_messages AS m SET
        status = coalesce(v.outcome::sms_message_status, m.status),
        provider_status = v.provider_status,
        delivered_at = CASE WHEN v.outcome = 'DELIVERED' THEN coalesce(v.done_at::timestamptz, now()) ELSE m.delivered_at END,
        error_reason = CASE WHEN v.outcome IN ('FAILED', 'UNDELIVERED') THEN v.provider_status ELSE m.error_reason END
      FROM (VALUES ${values}) AS v(id, outcome, provider_status, done_at)
      WHERE m.id = v.id AND m.status NOT IN ('DELIVERED', 'UNDELIVERED', 'FAILED', 'EXPIRED')
    `)
  }
  return updates.length
}

async function sweepTenant(env: Env, orgId: string, ctx: ExecutionContext): Promise<void> {
  const tenant = await getTenantDbForOrg(env, orgId, ctx)
  if (!tenant.ok) {
    console.warn(`[sms-sweep] org ${orgId}: tenant unavailable (${tenant.reason})`)
    return
  }
  const db = tenant.db
  const now = Date.now()

  // 1. Delivery reports the webhook missed (AC-16).
  const settings = await loadSmsSettings(env, db, tenant.keyring, orgId)
  const polled = settings ? await pollReports(db, settings) : 0

  // 2. Still SENT after 72 hours: no report is coming.
  const expired = await db
    .update(smsMessages)
    .set({ status: 'EXPIRED', errorReason: 'no delivery report' })
    .where(and(eq(smsMessages.status, 'SENT'), lt(smsMessages.sentAt, new Date(now - POLL_MAX_AGE_MS))))
    .returning({ id: smsMessages.id })

  const sending = await db
    .select({ id: smsCampaigns.id, sentAt: smsCampaigns.sentAt })
    .from(smsCampaigns)
    .where(eq(smsCampaigns.status, 'SENDING'))

  let reenqueued = 0
  for (const campaign of sending) {
    // 4. SENDING for more than 2 hours: give up on whatever is left (AC-13).
    if (campaign.sentAt && campaign.sentAt.getTime() < now - SENDING_TIMEOUT_MS) {
      await db
        .update(smsMessages)
        .set({ status: 'FAILED', errorReason: 'send timed out' })
        .where(and(eq(smsMessages.campaignId, campaign.id), eq(smsMessages.status, 'QUEUED')))
      await finaliseCampaign(db, campaign.id)
      continue
    }

    // 3. Chunks that were stored but never submitted (the send request died
    // before enqueueing, or the message was lost): queue them again. The
    // consumer's claim on submitAttemptedAt keeps a duplicate from sending twice.
    const orphaned = await db
      .selectDistinct({ batchRef: smsMessages.batchRef })
      .from(smsMessages)
      .where(and(
        eq(smsMessages.campaignId, campaign.id),
        eq(smsMessages.status, 'QUEUED'),
        isNull(smsMessages.submitAttemptedAt),
        isNotNull(smsMessages.batchRef),
        lt(smsMessages.createdAt, new Date(now - REENQUEUE_AFTER_MS)),
      ))
    if (orphaned.length > 0) {
      const messages: SmsSendMessage[] = orphaned.map((o) => ({ orgId, campaignId: campaign.id, batchRef: o.batchRef! }))
      await env.SMS_SEND_QUEUE.sendBatch(messages.map((body) => ({ body })))
      reenqueued += orphaned.length
    }

    // Idempotent: closes a campaign whose last chunk finished without finalising.
    await finaliseCampaign(db, campaign.id)
  }

  console.log(
    `[sms-sweep] org ${orgId}: polled ${polled}, expired ${expired.length}, re-enqueued ${reenqueued} chunk(s), ${sending.length} sending`,
  )
}

export async function handleSmsSweepQueue(batch: MessageBatch<SmsSweepMessage>, env: Env, ctx: ExecutionContext) {
  for (const message of batch.messages) {
    try {
      await sweepTenant(env, message.body.orgId, ctx)
      message.ack()
    } catch (err) {
      console.error(`[sms-sweep] org ${message.body.orgId}: ${err instanceof Error ? err.name : 'error'}`)
      message.retry()
    }
  }
}

