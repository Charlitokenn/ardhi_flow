// Every 30 minutes (wrangler.jsonc triggers.crons). Only lists the tenants
// that have set up SMS and enqueues one sweep per tenant onto sms-sweep, so
// each tenant's sweep runs in its own invocation, with its own limits, and one
// slow or broken tenant can't hold up the rest. The sweep itself is
// queue/sms-sweep.ts. See docs/specs/0004-sms-send-flow, AC-16.

import type { Env } from '../types'
import { listOrgIdsWithSms } from '../lib/sms-webhook-keys'
import type { SmsSweepMessage } from '../queue/sms-sweep'

// Queue.sendBatch takes at most 100 messages per call.
const SEND_BATCH_LIMIT = 100

export async function runSmsDeliverySweep(env: Env): Promise<void> {
  const orgIds = await listOrgIdsWithSms(env)
  for (let i = 0; i < orgIds.length; i += SEND_BATCH_LIMIT) {
    const messages: SmsSweepMessage[] = orgIds.slice(i, i + SEND_BATCH_LIMIT).map((orgId) => ({ orgId }))
    await env.SMS_SWEEP_QUEUE.sendBatch(messages.map((body) => ({ body })))
  }
  console.log(`[sms-delivery-sweep] enqueued ${orgIds.length} tenant sweep(s)`)
}
