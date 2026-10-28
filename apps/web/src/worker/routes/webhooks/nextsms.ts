import { Hono } from 'hono'
import { and, eq, notInArray } from 'drizzle-orm'
import type { Env } from '../../types'
import { smsDeliveryEvents, smsMessages } from '../../../../drizzle/tenant/schema'
import { decryptSecret, KeyringError, timingSafeEqualString } from '../../lib/crypto'
import { FINAL_MESSAGE_STATUSES, mapReportStatus, parseJsonKeepingIds } from '../../lib/nextsms'
import { findOrgIdBySmsWebhookKey } from '../../lib/sms-webhook-keys'
import { getTenantDbForOrg, type TenantDb } from '../../lib/tenant-db'

// NextSMS delivery reports (docs/specs/0004-sms-send-flow, AC-15). Public: the
// unguessable key in the path picks the tenant, and the per tenant verify
// token in the body is the only proof the call came from NextSMS (it sends no
// signature). NextSMS waits 5 seconds and never retries, so the reply is sent
// as soon as the token checks out and the rest runs in waitUntil. Anything
// this misses is caught by the delivery sweep.

interface DeliveryReport {
  token?: unknown
  messageId?: unknown
  status?: unknown
  id?: unknown
}

async function applyReport(db: TenantDb, report: DeliveryReport, providerMessageId: string, status: string) {
  const message = await db.query.smsMessages.findFirst({
    where: eq(smsMessages.providerMessageId, providerMessageId),
    columns: { id: true },
  })
  // Unknown messageId (another app on the same NextSMS account, or a test
  // send's fake id): ignored.
  if (!message) return

  // Everything except the verify token, for the audit trail.
  const payload: Record<string, unknown> = { ...report }
  delete payload.token
  await db.insert(smsDeliveryEvents).values({ messageId: message.id, status, rawPayload: payload, source: 'webhook' })

  const outcome = mapReportStatus(status)
  // A final status is never overwritten, and every report still adds an event.
  await db
    .update(smsMessages)
    .set({
      providerStatus: status,
      ...(outcome ? { status: outcome } : {}),
      ...(outcome === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
      ...(outcome === 'FAILED' || outcome === 'UNDELIVERED' ? { errorReason: status } : {}),
    })
    .where(and(eq(smsMessages.id, message.id), notInArray(smsMessages.status, [...FINAL_MESSAGE_STATUSES])))
}

const nextsmsWebhook = new Hono<{ Bindings: Env }>().post('/:key', async (c) => {
  const orgId = await findOrgIdBySmsWebhookKey(c.env, c.req.param('key'), c.executionCtx)
  if (!orgId) return c.body(null, 404)

  let report: DeliveryReport
  try {
    const parsed = parseJsonKeepingIds(await c.req.text())
    if (!parsed || typeof parsed !== 'object') return c.body(null, 400)
    report = parsed as DeliveryReport
  } catch {
    return c.body(null, 400)
  }

  let tenant
  try {
    tenant = await getTenantDbForOrg(c.env, orgId, c.executionCtx)
  } catch (err) {
    if (!(err instanceof KeyringError)) throw err
    console.error(`[nextsms-webhook] ${err.message}`)
    return c.body(null, 500)
  }
  // A tenant that is no longer active: acknowledged and ignored.
  if (!tenant.ok) {
    if (tenant.reason === 'decrypt_failed') return c.body(null, 500)
    return c.body(null, 200)
  }

  const settings = await tenant.db.query.smsSettings.findFirst({ columns: { webhookVerifyTokenEncrypted: true } })
  if (!settings) return c.body(null, 200)

  const { plaintext: verifyToken } = await decryptSecret(
    settings.webhookVerifyTokenEncrypted,
    tenant.keyring,
    orgId,
    'sms_verify_token',
  )
  if (typeof report.token !== 'string' || !timingSafeEqualString(report.token, verifyToken)) {
    console.warn(`[nextsms-webhook] org ${orgId}: wrong verify token`)
    return c.body(null, 401)
  }

  const providerMessageId = report.messageId == null ? '' : String(report.messageId)
  const status = typeof report.status === 'string' ? report.status : ''
  if (providerMessageId && status) {
    const db = tenant.db
    c.executionCtx.waitUntil(
      applyReport(db, report, providerMessageId, status).catch((err: unknown) => {
        // Org id and the error class only; the sweep will pick the message up.
        console.error(`[nextsms-webhook] org ${orgId}: could not apply report (${err instanceof Error ? err.name : 'error'})`)
      }),
    )
  }

  return c.body(null, 200)
})

export default nextsmsWebhook
