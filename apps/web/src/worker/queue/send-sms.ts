// Hands a campaign's QUEUED messages to NextSMS, one chunk (at most 500) per
// queue message. See docs/specs/0004-sms-send-flow, "Send pipeline" steps 3
// to 5, AC-11 to AC-14.
//
// The one rule that matters most: a row with submitAttemptedAt set is never
// submitted to NextSMS again. If a previous attempt may have reached NextSMS
// (a crash, a timeout, a 5xx), this checks NextSMS's logs instead, and when
// it still can't tell, it marks the rows FAILED 'unconfirmed, check NextSMS'.
// A rare false failure is better than texting a client twice.

import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { Env } from '../types'
import { smsCampaigns, smsMessages } from '../../../drizzle/tenant/schema'
import { getTenantDbForOrg, type TenantDb } from '../lib/tenant-db'
import { loadSmsSettings } from '../lib/sms-settings'
import { mapSendReplyStatus, type NextSmsSendReply } from '../lib/nextsms'
import { hasPersonalTokens } from '../lib/message-templates'

export interface SmsSendMessage {
  orgId: string
  campaignId: string
  batchRef: string
}

export const SMS_CHUNK_SIZE = 500

// NextSMS's logs can lag a fresh submit, so the first look that finds nothing
// waits this long and looks once more before giving up.
const LOGS_RETRY_DELAY_SECONDS = 120

const UNCONFIRMED = 'unconfirmed, check NextSMS'

// `c<campaign id without dashes>-<chunk index>`: at most 38 characters and no
// spaces, as NextSMS requires of a reference.
export function batchRefFor(campaignId: string, chunkIndex: number): string {
  return `c${campaignId.replace(/-/g, '')}-${chunkIndex}`
}

interface RowResult {
  id: string
  status: 'SENT' | 'FAILED'
  providerMessageId: string | null
  cost: string | null
  segments: number | null
  providerStatus: string | null
  errorReason: string | null
}

// One statement for the whole chunk, guarded by status = 'QUEUED', so a
// replay changes nothing.
async function applyResults(db: TenantDb, results: RowResult[]): Promise<void> {
  if (results.length === 0) return
  const values = sql.join(
    results.map(
      (r) =>
        sql`(${r.id}::uuid, ${r.status}::text, ${r.providerMessageId}::text, ${r.cost}::numeric, ${r.segments}::int, ${r.providerStatus}::text, ${r.errorReason}::text)`,
    ),
    sql`, `,
  )
  await db.execute(sql`
    UPDATE sms_messages AS m SET
      status = v.status::sms_message_status,
      provider_message_id = coalesce(v.provider_message_id, m.provider_message_id),
      cost = coalesce(v.cost, m.cost),
      segments_count = coalesce(v.segments, m.segments_count),
      provider_status = coalesce(v.provider_status, m.provider_status),
      error_reason = v.error_reason,
      sent_at = CASE WHEN v.status = 'SENT' THEN now() ELSE m.sent_at END
    FROM (VALUES ${values}) AS v(id, status, provider_message_id, cost, segments, provider_status, error_reason)
    WHERE m.id = v.id AND m.status = 'QUEUED'
  `)
}

const failAll = (ids: string[], errorReason: string): RowResult[] =>
  ids.map((id) => ({
    id,
    status: 'FAILED',
    providerMessageId: null,
    cost: null,
    segments: null,
    providerStatus: null,
    errorReason,
  }))

// SENDING -> SENT | FAILED once no QUEUED rows remain: SENT when NextSMS
// accepted at least one message. Idempotent, and safe to run twice at once.
export async function finaliseCampaign(db: TenantDb, campaignId: string): Promise<void> {
  await db.execute(sql`
    UPDATE sms_campaigns SET
      status = (CASE WHEN EXISTS (
        SELECT 1 FROM sms_messages
        WHERE campaign_id = ${campaignId} AND status IN ('SENT', 'DELIVERED', 'UNDELIVERED', 'EXPIRED')
      ) THEN 'SENT' ELSE 'FAILED' END)::sms_campaign_status,
      updated_at = now()
    WHERE id = ${campaignId}
      AND status = 'SENDING'
      AND NOT EXISTS (SELECT 1 FROM sms_messages WHERE campaign_id = ${campaignId} AND status = 'QUEUED')
  `)
}

type ChunkOutcome = { kind: 'done' } | { kind: 'retry'; delaySeconds?: number }

async function sendChunk(env: Env, message: SmsSendMessage, ctx: ExecutionContext): Promise<ChunkOutcome> {
  const { orgId, campaignId, batchRef } = message
  const tenant = await getTenantDbForOrg(env, orgId, ctx)
  if (!tenant.ok) {
    console.error(`[send-sms] org ${orgId} batch ${batchRef}: tenant unavailable (${tenant.reason})`)
    // A decrypt failure may be a keyring being rolled out; the rest won't fix themselves.
    return tenant.reason === 'decrypt_failed' ? { kind: 'retry' } : { kind: 'done' }
  }
  const db = tenant.db

  const rows = await db
    .select({
      id: smsMessages.id,
      phoneNumber: smsMessages.phoneNumber,
      body: smsMessages.body,
      submitAttemptedAt: smsMessages.submitAttemptedAt,
    })
    .from(smsMessages)
    .where(and(eq(smsMessages.batchRef, batchRef), eq(smsMessages.status, 'QUEUED')))
  if (rows.length === 0) {
    await finaliseCampaign(db, campaignId)
    return { kind: 'done' }
  }
  const ids = rows.map((r) => r.id)

  const settings = await loadSmsSettings(env, db, tenant.keyring, orgId)
  if (!settings) {
    await applyResults(db, failAll(ids, 'SMS settings were removed'))
    await finaliseCampaign(db, campaignId)
    return { kind: 'done' }
  }

  // ── crash safety (AC-14) ──
  const attempted = rows.filter((r) => r.submitAttemptedAt !== null)
  if (attempted.length > 0) {
    const firstAttempt = new Date(Math.min(...attempted.map((r) => r.submitAttemptedAt!.getTime())))
    const logs = await settings.client.getLogs({
      reference: batchRef,
      sentSince: firstAttempt.toISOString().slice(0, 10),
    })
    if (!logs.ok) {
      // Can't ask right now. Try later; the dead letter queue fails closed.
      if (logs.kind === 'unknown') return { kind: 'retry', delaySeconds: LOGS_RETRY_DELAY_SECONDS }
      await applyResults(db, failAll(ids, UNCONFIRMED))
      await finaliseCampaign(db, campaignId)
      return { kind: 'done' }
    }

    const entries = logs.data.results ?? []
    if (entries.length === 0) {
      // Logs may lag a fresh submit: look once more after a wait.
      const ageSeconds = (Date.now() - firstAttempt.getTime()) / 1000
      if (ageSeconds < LOGS_RETRY_DELAY_SECONDS) return { kind: 'retry', delaySeconds: LOGS_RETRY_DELAY_SECONDS }
      await applyResults(db, failAll(ids, UNCONFIRMED))
    } else {
      const byTo = new Map(entries.map((e) => [e.to, e]))
      await applyResults(
        db,
        rows.map((row): RowResult => {
          const entry = byTo.get(row.phoneNumber)
          if (!entry) return failAll([row.id], UNCONFIRMED)[0]
          return {
            id: row.id,
            status: 'SENT',
            providerMessageId: entry.messageId ?? null,
            cost: null,
            segments: null,
            providerStatus: entry.status?.name ?? null,
            errorReason: null,
          }
        }),
      )
    }
    await finaliseCampaign(db, campaignId)
    console.log(`[send-sms] org ${orgId} batch ${batchRef}: recovered from logs (${entries.length} found)`)
    return { kind: 'done' }
  }

  // ── normal submit ──
  // Marked before the call, so anything that happens after it can never
  // resend. The mark is also the claim: only rows this run marked are sent, so
  // two runs on one chunk (the sweep re-enqueued it while it was still
  // waiting) can never both submit. A run that claims nothing comes back
  // later and takes the crash safety path above.
  const claimedIds = new Set(
    (await db
      .update(smsMessages)
      .set({ submitAttemptedAt: new Date() })
      .where(and(inArray(smsMessages.id, ids), eq(smsMessages.status, 'QUEUED'), isNull(smsMessages.submitAttemptedAt)))
      .returning({ id: smsMessages.id })).map((r) => r.id),
  )
  if (claimedIds.size === 0) return { kind: 'retry', delaySeconds: LOGS_RETRY_DELAY_SECONDS }
  const claimed = rows.filter((r) => claimedIds.has(r.id))

  const campaign = await db.query.smsCampaigns.findFirst({
    where: eq(smsCampaigns.id, campaignId),
    columns: { templateBody: true, senderId: true },
  })
  const from = campaign?.senderId ?? settings.senderId

  // Decided once per campaign: identical text goes through /text/single, which
  // also avoids NextSMS refusing a chunk whose first message matches another
  // chunk's (the 24 hour duplicate rule).
  const reply = campaign && !hasPersonalTokens(campaign.templateBody)
    ? await settings.client.sendSingle({ from, to: claimed.map((r) => r.phoneNumber), text: claimed[0].body, reference: batchRef })
    : await settings.client.sendMulti({
      messages: claimed.map((r) => ({ from, to: r.phoneNumber, text: r.body })),
      reference: batchRef,
    })

  if (!reply.ok) {
    if (reply.kind === 'unknown') {
      // It may have landed. The retry takes the crash safety path above.
      console.warn(`[send-sms] org ${orgId} batch ${batchRef}: outcome unknown (${reply.status ?? 'network'}), will check logs`)
      return { kind: 'retry', delaySeconds: LOGS_RETRY_DELAY_SECONDS }
    }
    // Refused (bad token, sender not enabled for bulk, the duplicate rule):
    // nothing was sent, so this is final and is not retried.
    console.warn(`[send-sms] org ${orgId} batch ${batchRef}: refused (${reply.status})`)
    await applyResults(db, failAll([...claimedIds], reply.message))
    await finaliseCampaign(db, campaignId)
    return { kind: 'done' }
  }

  await applyResults(db, matchReply(claimed, reply.data))
  await finaliseCampaign(db, campaignId)
  console.log(`[send-sms] org ${orgId} batch ${batchRef}: submitted ${claimed.length}`)
  return { kind: 'done' }
}

// Matched by `to`, which is unique per campaign, so reply order doesn't matter.
function matchReply(rows: { id: string; phoneNumber: string }[], reply: NextSmsSendReply): RowResult[] {
  const byTo = new Map((reply.messages ?? []).map((m) => [m.to, m]))
  return rows.map((row) => {
    const sent = byTo.get(row.phoneNumber)
    if (!sent) return failAll([row.id], 'missing from NextSMS reply')[0]
    const outcome = mapSendReplyStatus(sent.status)
    return {
      id: row.id,
      status: outcome.status,
      providerMessageId: sent.messageId ?? null,
      cost: sent.price != null ? String(sent.price) : null,
      segments: sent.smsCount ?? null,
      providerStatus: sent.status?.name ?? null,
      errorReason: outcome.errorReason,
    }
  })
}

export async function handleSmsSendQueue(batch: MessageBatch<SmsSendMessage>, env: Env, ctx: ExecutionContext) {
  for (const message of batch.messages) {
    try {
      const outcome = await sendChunk(env, message.body, ctx)
      if (outcome.kind === 'retry') message.retry(outcome.delaySeconds ? { delaySeconds: outcome.delaySeconds } : undefined)
      else message.ack()
    } catch (err) {
      // Org id, batch and the error class only. Retried; the next attempt
      // sees submitAttemptedAt if the submit had started.
      console.error(
        `[send-sms] org ${message.body.orgId} batch ${message.body.batchRef}: ${err instanceof Error ? err.name : 'error'}`,
      )
      message.retry({ delaySeconds: LOGS_RETRY_DELAY_SECONDS })
    }
  }
}

// sms-send-dlq: a chunk that ran out of retries. Fails its remaining QUEUED
// rows closed (unconfirmed if a submit had started) and finalises.
export async function handleSmsSendDeadLetterQueue(batch: MessageBatch<SmsSendMessage>, env: Env, ctx: ExecutionContext) {
  for (const message of batch.messages) {
    const { orgId, campaignId, batchRef } = message.body
    try {
      const tenant = await getTenantDbForOrg(env, orgId, ctx)
      if (!tenant.ok) {
        message.ack()
        continue
      }
      const rows = await tenant.db
        .select({ id: smsMessages.id, submitAttemptedAt: smsMessages.submitAttemptedAt })
        .from(smsMessages)
        .where(and(eq(smsMessages.batchRef, batchRef), eq(smsMessages.status, 'QUEUED')))
      await applyResults(
        tenant.db,
        rows.flatMap((r) => failAll([r.id], r.submitAttemptedAt ? UNCONFIRMED : 'send gave up after retries')),
      )
      await finaliseCampaign(tenant.db, campaignId)
      console.warn(`[send-sms-dlq] org ${orgId} batch ${batchRef}: ${rows.length} row(s) failed after retries`)
      message.ack()
    } catch (err) {
      console.error(`[send-sms-dlq] org ${orgId} batch ${batchRef}: ${err instanceof Error ? err.name : 'error'}`)
      message.retry()
    }
  }
}
