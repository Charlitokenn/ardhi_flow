# 0004. Send SMS campaigns through each tenant's own NextSMS account

**Date**: 2026-10-27
**Status**: Proposed

## Summary

This spec makes the broadcast compose flow actually send. Each company connects its own NextSMS account (an API token and an approved sender ID) on a new SMS page in organization settings. Staff then build a campaign from a template, pick who gets it, see the cost against their balance, and send. Every client gets their own personalised text. Sending runs in the background through a Cloudflare Queue (a list of jobs the Worker works through with retries), and delivery reports come back by webhook (NextSMS calls our URL), with a polling sweep every 30 minutes to catch any reports the webhook missed. Drafts can be saved and finished later. Scheduling, recurring sends, and one off sends from the Reminders page are left for later.

## Requirements

**User stories**:

- As an org admin, I want to connect our company's NextSMS account once, so that every message goes out under our own registered sender ID and is paid from our own balance.
- As a staff member, I want to build a campaign from a template, pick the right clients, and send it, so that each client gets a reminder that lists exactly what they owe.
- As a staff member, I want to see the cost and our balance before I send, so that a campaign never stops halfway for lack of credit.
- As a staff member, I want to save a campaign and come back to it, so that I can prepare messages before I'm ready to send.
- As a staff member, I want to see whether each message was delivered, so that I know which clients to call instead.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):

- **AC-1**: An org admin can save a NextSMS API token and sender ID on a new "SMS" page in the organization settings dialog. Saving checks the token against NextSMS (`GET /api/v2/balance`). A rejected token is not saved, and the page says NextSMS rejected it. After the first save, the page shows a webhook URL (`<app origin>/api/webhooks/nextsms/<key>`) and a verify token, each with a copy button and a short instruction to paste both into the NextSMS dashboard (Customer Profile, Customization, Webhooks). After saving, the API token is never sent back to the browser; only its last 4 characters are shown.
- **AC-2**: A member who is not an org admin gets 403 when reading or changing the token, the verify token, or the webhook URL. Any member can see whether SMS is set up, the sender ID, and the current balance.
- **AC-3**: When the tenant has no SMS settings, the compose flow shows an "SMS is not set up" notice (with a link to the SMS settings page for admins, and "ask an admin" for everyone else). The test send, audience preview, and send endpoints return 409 `sms_not_configured`.
- **AC-4**: From the send step, any member can send the current message to one typed phone number. It is rendered for the chosen preview client (using the campaign's timing for their due items), or the spec 0002 sample client when none is chosen, and goes out through the tenant's real token and sender ID. It is logged as an `sms_messages` row with no campaign. A number that does not normalise to a Tanzanian mobile (`^255[67]\d{8}$`) is refused with 422 before NextSMS is called. Each member can send at most 10 test messages per hour (429 `rate_limited` beyond that), and a test send is refused with 422 `insufficient_balance` when the balance is below its price.
- **AC-5**: Any member can save a campaign as `DRAFT` (name, type, optional template, body, audience rules), reopen it later in the compose flow, edit it, and delete it. Editing or deleting a campaign that is not `DRAFT` returns 409. A deleted draft no longer appears on the dashboard.
- **AC-6**: The audience step offers "All clients" and, only when the campaign's template has a reminder timing, "Clients with <past due | due today | upcoming> installments". Staff can untick contacts from the resulting list and add any live client contact (`contactType = 'CLIENT'`, not deleted) through a search. The draft saves the rules (segment, timing, added ids, removed ids), not the list. A body that uses `{dueItems}` must have a reminder timing (from its template), or saving and previewing return 422 `timing_required`. Choosing a template sets the campaign type to the template's category, and the server rejects a mismatch with 422 `type_mismatch`; only a campaign with no template lets staff choose the type.
- **AC-7**: Before sending, the send step shows: the number of recipients, the skipped count for each reason (opted out, nothing due, no valid number, duplicate number, message too long), the estimated cost in TZS, and the current NextSMS balance. All of these are worked out from the saved rules at that moment, not when the draft was saved.
- **AC-8**: Contacts with `smsOptOut` are skipped for `MARKETING`, `GENERAL`, and `CUSTOM` campaigns, but not for `PAYMENT_REMINDER`, `OVERDUE_NOTICE`, or `FULLY_PAID_THANKYOU`. A contact is skipped as "nothing due" when the body uses `{dueItems}` and they have no due items for the timing; this is checked before rendering, so the text "Nothing due for this reminder timing." is never sent. Each contact is messaged on `mobileNumber`, or on `altMobileNumber` when the main number is missing or not a valid Tanzanian mobile, normalised to `255XXXXXXXXX` (`^255[67]\d{8}$`). If neither is valid, the contact is skipped. Contacts are processed oldest first (`createdAt`, then `id`), followed by hand added contacts in the order they were added. When a contact's number was already used by an earlier contact, they are skipped as a duplicate (the alternate number is not tried). A message longer than 15 GSM parts or 10 Unicode parts is skipped as too long.
- **AC-9**: Every recipient gets their own rendered text (spec 0002's `renderMessageTemplate`, with their own name and due items), and `sms_messages.body` holds exactly the text sent to them.
- **AC-10**: When the estimate plus a 2% margin is higher than the balance, the Send button is disabled and the send endpoint returns 422 `insufficient_balance`. No messages are created.
- **AC-11**: Pressing Send moves the campaign from `DRAFT` to `SENDING` exactly once. A second press, or a request running in parallel, gets 409. While any campaign in the tenant is `SENDING`, a send of another campaign gets 409 `another_send_in_progress`. An audience above 5,000 recipients gets 422 `audience_too_large`. The send freezes `templateBody`, `senderId`, and the recipient list as `QUEUED` `sms_messages` rows, returns within the request, and hands the messages to NextSMS in the background, at most 500 per request.
- **AC-12**: Each message NextSMS accepts becomes `SENT` with its `providerMessageId`, `cost`, `segmentsCount`, and `sentAt`. Each message it rejects becomes `FAILED`, with the NextSMS status name in `errorReason`.
- **AC-13**: A campaign becomes `SENT` once no `QUEUED` messages remain and NextSMS accepted at least one of them. It becomes `FAILED` when none were accepted. A chunk whose `QUEUED` rows were never submitted (for example, the send request died before enqueueing) is put back on the queue by the sweep after 10 minutes. No campaign stays `SENDING` for more than 2 hours.
- **AC-14**: If the background sender crashes or retries after a submit to NextSMS was attempted, no recipient gets the message twice. When it cannot confirm whether NextSMS received the chunk, it marks those rows `FAILED` with `errorReason = 'unconfirmed, check NextSMS'` and never resends them automatically.
- **AC-15**: A delivery report sent to `POST /api/webhooks/nextsms/<key>` with the matching verify token updates that message's status and adds an `sms_delivery_events` row (`source = 'webhook'`, with the payload stored minus the token). An unknown key returns 404, a wrong token returns 401, and an unknown `messageId` returns 200 and is ignored. A message that has reached a final status never moves back.
- **AC-16**: Every 30 minutes, messages still `SENT` that are between 15 minutes and 72 hours old are checked against `GET /api/v2/reports`, least recently checked first so that no message is starved, and updated (events with `source = 'poll'`). Messages still `SENT` after 72 hours become `EXPIRED` with `errorReason = 'no delivery report'`.
- **AC-17**: Clicking a `SENDING`, `SENT`, or `FAILED` campaign on the dashboard opens a detail sheet with its counts (sent, delivered, failed, skipped by reason; "sent" means accepted by NextSMS, the same meaning as the dashboard grid) and a paged list of recipients showing name, number, status, error, and time. Clicking a `DRAFT` opens it in the compose flow.
- **AC-18**: The NextSMS token and verify token are stored encrypted with `TENANT_CONN_KEYRING`. They are never logged, never put in KV, and never returned by any endpoint except as described in AC-1 (admins see the verify token, and only the last 4 characters of the API token). Key rotation (`rotate:keys`) re-encrypts them too.

## Decision

**Chosen option**: Option 1: queue backed sending on each tenant's own NextSMS account, with a webhook plus a polling sweep for delivery.

Each tenant stores its own encrypted NextSMS v2 token and sender ID. Sends are rendered per recipient at send time, written as `QUEUED` rows, and handed to NextSMS's `/text/multi` by a new `SMS_SEND_QUEUE` consumer in 500 message chunks. Delivery status comes in through a per tenant webhook URL, and a cron sweep backs it up.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

### NextSMS facts this design relies on

Checked against the NextSMS v2 docs on 2026-10-27 (links in rationale.md). Confirm them again at build time.

- Base URL `https://messaging-service.co.tz`. Headers: `Authorization: Bearer <token>`, `Accept: application/json` (without it, validation errors come back as redirects), `Content-Type: application/json`.
- `POST /api/sms/v2/text/multi`: `{ messages: [{ from, to, text }], reference }`. At most 500 messages. `to` must be `255XXXXXXXXX`. The sender ID must be enabled for bulk sending. `reference` is at most 50 characters with no spaces. The reply is `{ messages: [{ to, status: { groupName, name, id }, messageId, smsCount, price }] }`, and it is HTTP 200 even when some recipients are rejected. A request is refused if its first message equals the first message of a request sent in the last 24 hours.
- `POST /api/sms/v2/text/single`: `{ from, to: string | string[], text, reference }`, one text to one or more numbers, with the same reply shape as `/text/multi`. `POST /api/sms/v2/test/text/single` validates without sending or charging (its `messageId`s are not real). Whether its `price` is real is not documented; check this at build. When the price comes back missing or zero, preview and send return 502 `price_unavailable` rather than estimating 0.
- `GET /api/v2/balance` returns `{ sms_balance, display, ... }` in TZS.
- `GET /api/v2/reports?messageId=…&messageId=…` (max 200) returns `results[]` with `messageId`, `status.groupName`, `status.name`, `doneAt`.
- `GET /api/v2/logs?reference=…&sentSince=…` (limit max 200, with `offset`) lists sent messages by reference.
- Webhook: one URL plus a "Verify Token" per NextSMS account, set in that account's dashboard. NextSMS POSTs `{ token, messageId, status, id }` with a 5 second timeout and **no retries**, and expects HTTP 200.
- Segments: GSM text is 160 characters (153 per part when longer); Unicode is 70 (67 per part). The maximum is 15 GSM parts or 10 Unicode parts.

### Data model sketch

**Tenant DB**

| Table | Change | Fields | Keys and relations |
|---|---|---|---|
| `sms_settings` | new, at most one row | `id` uuid PK · `singleton` boolean not null default true, **unique** · `apiTokenEncrypted` text not null · `senderId` text not null (exact case as registered) · `webhookKey` text not null (copy of the catalog key, used only to show the URL) · `webhookVerifyTokenEncrypted` text not null · `updatedBy` text · `createdAt`, `updatedAt` timestamptz | standalone. The unique `singleton` column enforces one row; writes use `INSERT … ON CONFLICT (singleton) DO UPDATE` |
| `sms_campaigns` | add columns | `templateId` uuid null · `audience` jsonb not null, default `{"segment":"ALL_CLIENTS","reminderTiming":null,"includeContactIds":[],"excludeContactIds":[]}` · `skipped` jsonb null · `sentAt` timestamptz null · `sentBy` text null · `isDeleted` boolean not null default false | `templateId` → `message_templates.id`, N:1, `on delete set null`. `templateBody` and `senderId` are frozen copies (`senderId` is copied from settings at send) |
| `sms_messages` | add columns | `batchRef` text null · `submitAttemptedAt` timestamptz null (set just before the chunk is handed to NextSMS) · `lastPolledAt` timestamptz null (last time the sweep asked NextSMS about this message) · `providerStatus` text null (latest raw NextSMS status name) | new indexes on `batchRef` and on `(status, lastPolledAt)`. Existing FKs and indexes are unchanged |
| `sms_delivery_events` | add column | `source` text not null default `'webhook'` (`'webhook'` or `'poll'`) | unchanged |

`audience` shape (zod validated, shared by the API and the compose flow):

```ts
{
  segment: 'ALL_CLIENTS' | 'DUE',
  reminderTiming: 'UPCOMING' | 'DUE_TODAY' | 'PAST_DUE' | null, // frozen copy from the template; required when segment = 'DUE'
  includeContactIds: string[], // hand added
  excludeContactIds: string[], // hand removed
}
```

`skipped` shape, written at send: `{ optedOut: number, nothingDue: number, noValidNumber: number, duplicateNumber: number, tooLong: number }`.

Every read of `audience` and `skipped` goes through the zod schema with defaults, so campaigns created before this spec (seeded with `{}` and no `skipped`, `sentBy`, or `sentAt`) still read cleanly. The detail sheet shows a dash for missing values.

**Catalog DB**

| Table | Change | Fields |
|---|---|---|
| `tenant_projects` | add column | `smsWebhookKey` text null, unique |

Added after the data model was confirmed: `sentBy` (any member can send, so the campaign has to record who pressed Send; `createdBy` only records who started the draft), plus `singleton`, `submitAttemptedAt`, and `lastPolledAt` from the cross check (a unique one row rule, crash safety, and fair polling).

### State transitions

Campaign: `DRAFT → SENDING → SENT | FAILED`. `SCHEDULED` stays unused until scheduling is designed. Only `DRAFT` is editable or deletable.

- `DRAFT → SENDING`: the send endpoint, with a conditional `UPDATE … WHERE id = ? AND status = 'DRAFT' AND is_deleted = false AND NOT EXISTS (another campaign with status 'SENDING') RETURNING id`, which also writes `recipientCount`, `skipped`, `senderId`, `sentAt`, and `sentBy` in the same statement. Zero rows means 409 (`not_draft` or `another_send_in_progress`, told apart by a follow up read).
- PATCH and DELETE are also single conditional updates (`WHERE id = ? AND status = 'DRAFT' AND is_deleted = false RETURNING`), so neither can land after a send has claimed the campaign.
- `SENDING → SENT | FAILED`: finalisation (see invariants), run by the queue consumer after each chunk and by the cron sweep.

Message: `QUEUED → SENT | FAILED` (the send reply), then `SENT → DELIVERED | UNDELIVERED | FAILED | EXPIRED` (reports, or the sweep at 72 hours). `DELIVERED`, `UNDELIVERED`, `FAILED`, and `EXPIRED` are final and are never overwritten.

NextSMS status mapping lives in `worker/lib/nextsms.ts` as **two functions**:

`mapSendReplyStatus(status)`, used only on the `/text/single` and `/text/multi` reply: group `PENDING` becomes `SENT`; anything else becomes `FAILED`, with `status.name` stored in `errorReason`.

`mapReportStatus(nameOrGroup)`, used by the webhook (a single `status` string) and the sweep (`status.name`, falling back to `status.groupName`). The exact name is matched first, then the group:

| Exact name | Our `status` |
|---|---|
| `DELIVERED` | `DELIVERED` |
| `EXPIRED` | `EXPIRED` |
| `UNDELIVERABLE`, `DELETED`, `SKIPPED`, `UNKNOWN`, `DISCARDED`, `REJECTED` (the delivery report name, id 79) | `UNDELIVERED` |
| any `REJECTED_*`, any `FAILED_*`, `MISSING_TO` | `FAILED` |
| `PENDING_WAITING_DELIVERY`, `ENROUTE (SENT)`, `ACCEPTED`, `DISPATCHED`, `PENDING` | no change (stays `SENT`) |

| Group, used only when the name is not in the table above | Our `status` |
|---|---|
| `DELIVERED` / `DELIVERY` | treat the name as unknown: no change |
| `REJECTED`, `FAILED` | `FAILED` |
| `PENDING` | no change |
| anything else | no change; `providerStatus` is still recorded |

A plain `REJECTED` in a report is a carrier saying "not delivered" after acceptance, so it becomes `UNDELIVERED`. Rejection at submit only happens on the send reply, which `mapSendReplyStatus` handles. A message can therefore never go from `QUEUED` to `UNDELIVERED`.

### API surface

All routes are under the authed chain (`clerkAuth()` then `tenantResolver()`) except the webhook.

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/api/sms-settings` | GET | none | `configured`, `senderId`; admins also get `tokenLast4`, `webhookUrl`, `verifyToken` | any member | none |
| `/api/sms-settings` | PUT | `senderId`: string (req), `apiToken`: string (req on first save, optional after) | same as GET, plus `accountChanged: boolean` when the token changed | `org:admin` | 403, 422 `token_rejected` (NextSMS 401 on `/v2/balance`), 422 `sender_rejected` (the free `/test/text/single` check rejected the sender ID), 422 invalid |
| `/api/sms-settings/balance` | GET | none | `smsBalance`: number, `display`: string | any member | 409 `sms_not_configured`, 502 `nextsms_unavailable` |
| `/api/campaigns` | GET (existing) | none | rows where `isDeleted = false` (all statuses), with `sentCount` and `deliveredCount` (meanings below) plus `failedCount`, counted with a SQL `GROUP BY campaign_id, status` instead of loading every message | any member | none |
| `/api/campaigns` | POST | `name`, `type`, `templateId?`, `templateBody`, `audience` | campaign (`DRAFT`) | any member | 422 invalid, 422 `timing_required`, 422 `type_mismatch` |
| `/api/campaigns/:id` | GET | `page?` (default 1, 100 per page) | campaign, counts `{queued, sent, delivered, failed, undelivered, expired}`, `skipped`, `messages[]` (contact name, phone, status, errorReason, sentAt, deliveredAt), `totalMessages` | any member | 404 |
| `/api/campaigns/:id` | PATCH | any POST field | campaign | any member | 404, 409 `not_draft`, 422 (same checks as POST) |
| `/api/campaigns/:id` | DELETE | none | `{ ok: true }` (sets `isDeleted`) | any member | 404, 409 `not_draft` |
| `/api/campaigns/audience-preview` | POST | `type`, `templateId?`, `templateBody`, `audience` | `recipients[]` (contactId, name, phone), `skipped[]` (contactId, name, reason), `skippedCounts`, `totalSegments`, `estimatedCost`, `balance` | any member | 409 `sms_not_configured`, 422 (same checks as POST), 422 `audience_too_large`, 502 `price_unavailable`, 502 |
| `/api/campaigns/:id/send` | POST | none (sends the saved draft) | `{ status: 'SENDING', recipientCount }` (202) | any member | 404, 409 `not_draft`, 409 `another_send_in_progress`, 409 `sms_not_configured`, 422 `empty_audience`, 422 `audience_too_large`, 422 `insufficient_balance`, 502 `price_unavailable`, 502 |
| `/api/campaigns/test-send` | POST | `phoneNumber` (req), `templateBody` (req), `contactId?`, `reminderTiming?` | `{ status: 'SENT' \| 'FAILED' (our enum), errorReason? }` | any member | 409 `sms_not_configured`, 422 `invalid_number`, 422 `timing_required`, 422 `insufficient_balance`, 429 `rate_limited`, 502 |
| `/api/webhooks/nextsms/:key` | POST | NextSMS payload `{ token, messageId, status, id }` | 200 empty | public, verify token checked | 404 unknown key, 401 wrong token |

Count meanings, shared by the grid and the detail sheet: **sent** = accepted by NextSMS (`SENT`, `DELIVERED`, `UNDELIVERED`, `EXPIRED`); **delivered** = `DELIVERED`; **failed** = `FAILED`. The detail sheet's per status counts are the raw breakdown underneath them.

The compose flow saves the draft (POST, then PATCH) before it calls send, so send always works on what is stored. The audience step's client search reuses the existing `GET /api/contacts`.

Background entry points (not HTTP):

- **Send consumer** `worker/queue/send-sms.ts` takes `{ orgId, campaignId, batchRef }`. `wrangler.jsonc` gets queue `sms-send`, binding `SMS_SEND_QUEUE`, consumer `max_batch_size: 1`, `max_retries: 3`, `dead_letter_queue: sms-send-dlq`.
- **Dead letter consumer** (same file, a second handler) for `sms-send-dlq`: marks the chunk's still `QUEUED` rows `FAILED` with `errorReason = 'send gave up after retries'`, then finalises the campaign.
- **Sweep consumer** `worker/queue/sms-sweep.ts` takes `{ orgId }`, on queue `sms-sweep` (binding `SMS_SWEEP_QUEUE`, `max_batch_size: 5`, `max_retries: 2`, no DLQ). It does one tenant's sweep (below).
- **Cron** `worker/cron/sms-delivery-sweep.ts`, with `triggers.crons: ["*/30 * * * *"]` and a new `scheduled` export. It only lists tenants and enqueues one `{ orgId }` per tenant onto `SMS_SWEEP_QUEUE`, so each tenant's sweep runs in its own invocation with its own limits.
- `index.ts` exports `{ fetch, queue, scheduled }`. `queue` switches on `batch.queue` (`tenant-provisioning`, `sms-send`, `sms-send-dlq`, `sms-sweep`), and the `satisfies ExportedHandler<Env, …>` message type becomes a union of the three message types.
- `getTenantDbForOrg(env, orgId, ctx?)` returns a result type: `{ ok: true, db } | { ok: false, reason: 'no_tenant' | 'inactive' | 'decrypt_failed' }`. It takes an optional `ExecutionContext` for the KV cache write (consumers and cron pass theirs; without one it skips the cache write). The middleware maps the failures to its existing HTTP responses.

### Send pipeline (what the send endpoint and consumer do)

1. **Send endpoint**:
   - Load settings (409 if missing), load the draft (404, 409 `not_draft`), and resolve the audience (below). If it is empty, return 422 `empty_audience`; above 5,000 recipients, return 422 `audience_too_large`.
   - Fetch the balance and the price per segment. If `estimate × 1.02 > balance`, return 422.
   - Run the conditional claim update (State transitions), which writes the totals at the same time. If no row comes back, return 409.
   - In batches of 500, insert the `QUEUED` rows with `batchRef = 'c' + campaignId without dashes + '-' + chunkIndex` (at most 38 characters). Enqueue one message per chunk with `sendBatch`, and return 202.
   - If an insert or enqueue throws, delete the inserted rows and revert the campaign to `DRAFT` (conditional on `SENDING`) before returning the error.
   - If the Worker dies before that cleanup can run, the sweep's re-enqueue rule (below) finishes the job, because the rows already exist.
2. **Audience resolution** (`worker/lib/sms-audience.ts`, shared by preview and send):
   - Start from the segment. `ALL_CLIENTS` is live contacts with `contactType = 'CLIENT'`; `DUE` is those with at least one due group for `reminderTiming`. Order them by `createdAt, id`.
   - Append `includeContactIds` in the order given, keeping only live `CLIENT` contacts. Unknown or deleted ids are dropped silently.
   - Drop `excludeContactIds`.
   - Apply the AC-8 rules in this order: opted out, nothing due (`dueItems.length === 0`, checked before rendering), no valid number, duplicate number, too long.
   - Due items come from a new batched `findDueItemsForContacts(db, contactIds, timing, today)`: 2 queries for the whole list, selecting only the columns rendering needs. The existing `findDueItemsForContact` delegates to it, so spec 0002's tests keep passing.
   - Render with the real signature: `renderMessageTemplate({ body: campaign.templateBody, reminderTiming: audience.reminderTiming }, { firstName, dueItems })`.
   - Count segments with the existing `computeSmsSegments` (`message-templates.ts`). Too long means `segmentCount > 15` for GSM text or `> 10` for Unicode, and an empty rendered text is also treated as too long.
3. **Two send modes, decided once per campaign.** A body with no per client placeholders (no `{firstName}`, `{dueItems}`, or other spec 0002 tokens) renders the same text for everyone. Each chunk then goes to `/text/single` with `to` set to the chunk's numbers, which also avoids NextSMS's 24 hour duplicate refusal on identical first messages across chunks. A personalised body goes to `/text/multi`.
4. **Send consumer, per chunk**: load the rows with this `batchRef`. If none are still `QUEUED`, finalise and acknowledge.
   - **Crash safety** (AC-14): if any `QUEUED` row in the chunk already has `submitAttemptedAt`, a previous attempt may have reached NextSMS.
     - Check `GET /api/v2/logs?reference=<batchRef>&sentSince=<date>`. If it has entries, match them to rows by `to`, mark the matches `SENT` with their `messageId`, and mark the unmatched rows `FAILED` (`'unconfirmed, check NextSMS'`).
     - If logs are empty and this is the first time the attempt was seen, `message.retry({ delaySeconds: 120 })` once, because the logs may lag.
     - Still empty after that: mark the rows `FAILED` (`'unconfirmed, check NextSMS'`). **Never resend a chunk that has `submitAttemptedAt`.**
   - Otherwise, set `submitAttemptedAt = now()` on the chunk's `QUEUED` rows, then call NextSMS with `reference = batchRef`.
   - Match the reply to rows by `to`. Numbers are unique per campaign, so this does not depend on reply order. Request rows missing from the reply are marked `FAILED` (`'missing from NextSMS reply'`). Apply `mapSendReplyStatus`.
   - Write the results as one `UPDATE sms_messages … FROM (VALUES …)` statement, guarded by `WHERE sms_messages.status = 'QUEUED'`, so a replay changes nothing.
   - NextSMS 401, or 422 (bad token, sender not enabled for bulk, the duplicate refusal): mark the chunk's rows `FAILED` with the NextSMS message, and **do not retry** (the request was refused, so nothing was sent).
   - Network error, timeout, 429, or 5xx: the request may or may not have landed. Throw, so the queue retries; the next attempt sees `submitAttemptedAt` and follows the crash safety path above instead of resending.
   - Finalise the campaign.
5. **Finalise** (idempotent, safe to run twice at once): if no `QUEUED` rows remain, set `SENT` when any message has a `providerMessageId`, else `FAILED`, with `WHERE status = 'SENDING'`.

### Webhook and sweep

- **Webhook**:
  - Look up `key` through the catalog helper. KV caches hits for 5 minutes under `smskey:<key>` and misses for 60 seconds (so a flood of bad keys doesn't reach the catalog). An unknown key returns 404.
  - A tenant that isn't `active`, or has no settings, returns 200 and is ignored.
  - Get the tenant DB and the settings row, decrypt the verify token, and compare it in constant time. A mismatch returns 401.
  - Return 200 straight away, and do the rest in `c.executionCtx.waitUntil`, so the reply beats NextSMS's 5 second timeout even when Neon is waking up:
    - find the message by `providerMessageId` (unknown: stop);
    - insert the event (payload without `token`, `source = 'webhook'`);
    - apply `mapReportStatus` with the final status guard (`WHERE status NOT IN (final statuses)`), and set `deliveredAt` on `DELIVERED`.
- **Sweep, per tenant** (on the sweep consumer; the cron only lists `active` tenants with `smsWebhookKey` set and enqueues them). Each step is idempotent, so an overlapping run is harmless:
  - Poll up to 200 `SENT` messages with `sentAt` between 15 minutes and 72 hours ago, ordered by `lastPolledAt` ascending (never polled first), in one `/reports` call. Set `lastPolledAt = now()` on all 200, and apply the results (`source = 'poll'`).
  - Mark `SENT` messages older than 72 hours `EXPIRED` (`'no delivery report'`).
  - For campaigns `SENDING` with `QUEUED` rows that have no `submitAttemptedAt` and were created more than 10 minutes ago, enqueue those chunks again (re-enqueue rule).
  - For campaigns `SENDING` for more than 2 hours, mark their remaining `QUEUED` rows `FAILED` (`'send timed out'`) and finalise.
- **Test send limit**: a KV counter `smstest:<orgId>:<userId>:<UTC hour>` with a 1 hour TTL, incremented before each test send. A count already at 10 or more returns 429. KV is eventually consistent, so a burst can slip slightly past 10; that is acceptable for a cost guard. The balance check uses `/v2/balance` against the price from the free test endpoint.

### Value sourcing

| Action | Value produced / displayed | Source |
|---|---|---|
| Settings save | token validity | `GET /api/v2/balance` with the submitted token; a NextSMS 401 means rejected |
| Settings save | sender ID validity | `POST /api/sms/v2/test/text/single` (free, not sent) with `from = senderId`, `to = 255700000000`, `text = 'test'`. A reply `groupName` of `REJECTED` (for example `REJECTED_SOURCE`) means `sender_rejected` |
| Settings save | `accountChanged` | true when a new `apiToken` was submitted on an existing row. The page then warns that the webhook URL and verify token must be pasted into the new NextSMS account too |
| Settings save | `webhookKey` | 32 random bytes, base64url, generated on first save. Catalog write: `UPDATE tenant_projects SET sms_webhook_key = ? WHERE org_id = ? AND sms_webhook_key IS NULL`, then read the stored key back, so a retry after a half failed save reuses the existing key instead of stranding one. The tenant row is upserted with the key that was read back |
| Settings save | verify token | 24 random bytes, base64url, generated on first save, stored encrypted |
| Settings GET | `webhookUrl` | `new URL(c.req.url).origin` + `/api/webhooks/nextsms/` + `sms_settings.webhookKey` |
| Settings GET | `tokenLast4` | last 4 characters of the decrypted token |
| Any NextSMS call | base URL | `NEXTSMS_BASE_URL` var (default `https://messaging-service.co.tz`) |
| Any NextSMS call (in a route) | token, sender ID | decrypted `sms_settings` row for the tenant from `c.get('tenantDb')`; `orgId` from `c.get('orgId')` is the bound data |
| Consumer, webhook, sweep | tenant DB | `orgId` (queue message, catalog key lookup, catalog list) → shared `getTenantDbForOrg(env, orgId)` extracted from `tenant-resolver.ts` |
| Audience | "today" for due timing | `todayDateString()` (UTC date, same as spec 0002; no tenant timezone exists) |
| Audience | `reminderTiming` | `audience.reminderTiming`, frozen from the template's `reminderTiming` when the template is picked. Required (422 `timing_required`) whenever the body contains `{dueItems}` |
| Campaign save | `type` | `message_templates.category` when `templateId` is set (a mismatch returns 422 `type_mismatch`); the staff pick otherwise |
| Audience | opt out applies | `sms_campaigns.type` in `MARKETING`, `GENERAL`, `CUSTOM` |
| Audience | first name | first word of `contacts.fullName`, the same rule spec 0002's preview uses |
| Audience | phone | `contacts.mobileNumber`, else `altMobileNumber`, through `normaliseTzMobile` in `packages/shared-schema` (imported by both the client and the Worker, replacing the client only copy in `utils.ts`). It strips spaces, `+`, and a leading `00`, maps `0XXXXXXXXX` and `XXXXXXXXX` to `255…`, and accepts only `^255[67]\d{8}$` |
| Render | message text | `renderMessageTemplate({ body: campaign.templateBody, reminderTiming: audience.reminderTiming }, { firstName, dueItems })` from spec 0002 |
| Render | send mode | `/text/single` when the body has no spec 0002 placeholder tokens, `/text/multi` otherwise |
| Preview | segments per message | existing `computeSmsSegments(text).segmentCount` |
| Preview | estimated cost | price per segment × `totalSegments`. Price per segment = `price / smsCount` from one free `POST /api/sms/v2/test/text/single` call with the first recipient's text. Missing or zero price: 502 `price_unavailable`. Price and balance are both TZS |
| Send | balance check | `estimatedCost × 1.02 ≤ sms_balance`, re-checked at send even after a passing preview |
| Preview | balance | `GET /api/v2/balance` → `sms_balance` |
| Send | `senderId`, `sentBy`, `sentAt` | `sms_settings.senderId`, `c.get('userId')`, now |
| Send | `createdBy` (POST) | `c.get('userId')` |
| Consumer | `providerMessageId`, `cost`, `segmentsCount`, `providerStatus` | the `/text/multi` or `/text/single` reply: `messageId` (kept as a string, since it is 64 bit), `price`, `smsCount`, `status.name` |
| Test send | `providerMessageId`, `cost`, `segmentsCount`, `status` | the `/text/single` reply, same fields, through `mapSendReplyStatus` |
| Test send | due items | `contactId` given: `findDueItemsForContacts` for that contact with `reminderTiming` (required when the body has `{dueItems}`). No contact: spec 0002's sample due items |
| Detail sheet | counts | grouped from `sms_messages.status` for the campaign at read time (not stored) |
| Detail sheet | recipient name | `contacts.fullName` through `contactId` (shown as "Removed contact" when null) |
| Test send | text | `renderMessageTemplate` for `contactId`'s data, or the spec 0002 sample client (`SAMPLE_FIRST_NAME` and friends) |

### Key invariants

- At most one `sms_settings` row per tenant DB (unique `singleton`), and catalog `smsWebhookKey` is unique across tenants.
- A campaign leaves `DRAFT` only through the conditional update, so a campaign's messages are created once. At most one campaign per tenant is `SENDING`.
- Every `sms_messages` row in a campaign has a `batchRef`. A row with `submitAttemptedAt` set is never submitted to NextSMS again.
- Consumer and sweep writes only change rows still in the state they expect (`QUEUED`, or not final), so replays and overlaps are harmless.
- No rendered message containing "Nothing due for this reminder timing." is ever sent.
- Final message statuses (`DELIVERED`, `UNDELIVERED`, `FAILED`, `EXPIRED`) are never overwritten. Every report still adds an event row.
- `sms_messages.body` is exactly the text sent, and `phoneNumber` is the bare `255XXXXXXXXX` used.
- One message per phone number per campaign.
- Campaign counts are computed from messages at read time. Only `recipientCount` and `skipped` are stored, and they are written once at send.

### Security model

- **Settings**: only `org:admin` reads or writes the token, the verify token, and the webhook URL (same check as `company-settings.ts`). Any member reads `configured`, `senderId`, and the balance.
- **Campaigns, preview, test send, send**: any member of the org (your choice). `createdBy` and `sentBy` record who did it. The balance block (AC-10), one send at a time per tenant, the 5,000 recipient cap, and 10 test sends per member per hour limit how much one person can spend or send by mistake.
- **Tenant isolation**: routes use only `c.get('tenantDb')`. The webhook, consumer, and sweep reach a tenant only through `getTenantDbForOrg`, after resolving `orgId` from a trusted source (the queue message we wrote, a catalog key lookup, or the catalog list). The catalog is touched only through `worker/lib/sms-webhook-keys.ts` (`findOrgIdBySmsWebhookKey`, `setSmsWebhookKey`, `listOrgIdsWithSms`), a narrow exception to "routes never touch the catalog DB". It gets written into the root `AGENTS.md` rule (build plan step 14), so it stays visible.
- **Secrets at rest**: the token and verify token are encrypted with the existing keyring format (`<keyId>:<base64>`, AES GCM). The bound data is the UTF 8 string `<orgId>|<purpose>|<keyId>`, with purpose `sms_api_token` or `sms_verify_token`, so a value copied into another column or tenant fails to decrypt. That format cannot collide with the connection string's existing bound data, which stays unchanged.
- **Webhook**: public, protected by the unguessable key in the path plus the constant time verify token check. NextSMS sends no signature, so the token is the only proof. Unknown keys are cached as misses, so floods don't reach the catalog. There is no rate limit rule in v1 (see Follow-up, alongside the existing provisioning webhook gap in `SCAFFOLD_NOTES.md`).
- **Logs**: log org id, campaign id, batch ref, counts, and NextSMS status codes only. Never tokens, message text, or full phone numbers.
- **Personal data**: phone numbers and message text (which includes amounts owed) are stored in the tenant DB only, and are never sent anywhere except NextSMS.

### Configuration required

- No new secrets. The NextSMS credentials live per tenant (encrypted). `TENANT_CONN_KEYRING` is reused.
- `NEXTSMS_BASE_URL` (`wrangler.jsonc` `vars`, `https://messaging-service.co.tz`): lets local development point at a mock.
- `wrangler.jsonc`: queues `sms-send` (producer binding `SMS_SEND_QUEUE`), `sms-send-dlq` (consumed), and `sms-sweep` (producer binding `SMS_SWEEP_QUEUE`), with consumers as above, plus `triggers.crons: ["*/30 * * * *"]`. Create the three queues with `wrangler queues create` before deploying. Add `SMS_SEND_QUEUE`, `SMS_SWEEP_QUEUE`, and `NEXTSMS_BASE_URL` to `Env` in `worker/types.ts`.
- **Precondition: the Workers Paid plan.** Resolving and rendering up to 5,000 recipients and inserting them in one request needs paid plan CPU and subrequest limits; the free plan's limits are far too small.
- **Prerequisite for each tenant (manual, by you as reseller)**: a NextSMS account, an approved sender ID **enabled for bulk sending**, and an API token generated in that account (Customer Profile, Customization, API Keys). The NextSMS reseller API for creating these is not documented.

### Critical test scenarios

- Happy path: an admin saves a valid token, a member sends a past due reminder campaign to 3 clients, each gets their own amounts, NextSMS accepts, the webhook reports `DELIVERED`, and the detail sheet shows 3 delivered. Verifies **AC-1**, **AC-6**, **AC-9**, **AC-11**, **AC-12**, **AC-13**, **AC-15**, **AC-17**.
- Rules: in a `MARKETING` campaign, an opted out client, a client with no number, and two clients sharing a number are skipped and counted correctly, while the same opted out client in a `PAYMENT_REMINDER` campaign is included. Verifies **AC-7**, **AC-8**.
- Rules, part two: a hand typed `{dueItems}` body with no timing gets 422 `timing_required`; a reminder template with type `MARKETING` gets 422 `type_mismatch`; a hand added client who owes nothing is skipped, and no sent body contains "Nothing due for this reminder timing.". Verifies **AC-6**, **AC-8**.
- Double send: two parallel `POST /send` calls on one draft; exactly one gets 202 and messages are created once. Sending a second campaign while the first is `SENDING` gets 409 `another_send_in_progress`. Verifies **AC-11**.
- Crash after submit: the consumer throws after `/text/multi` succeeds. The retry sees `submitAttemptedAt`, finds the reference in `/v2/logs`, marks the rows `SENT`, and does not call NextSMS again. With logs empty twice, the rows end `FAILED` 'unconfirmed, check NextSMS', and NextSMS was called exactly once. Verifies **AC-14**.
- Orphaned send: the send request dies after inserting rows but before enqueueing; within 10 minutes plus one sweep the chunks are enqueued and sent. Verifies **AC-13**.
- Identical marketing text to 1,200 clients goes out as three `/text/single` chunks, and none is refused as a duplicate. Verifies **AC-11**, **AC-12**.
- NextSMS down: a 5xx on every attempt; the last attempt marks the chunk `FAILED` and the campaign ends `FAILED`. Verifies **AC-12**, **AC-13**.
- Balance short: estimate above balance; Send disabled, endpoint 422, no rows. Verifies **AC-10**.
- Missed report: no webhook arrives; the sweep updates the message from `/reports`; after 72 hours an unreported message becomes `EXPIRED`. With 450 messages pending, three sweeps poll all of them (`lastPolledAt` rotation). Verifies **AC-16**.
- Test send limit: the 11th test send in an hour by one member gets 429. Verifies **AC-4**.
- Webhook abuse: a wrong token gets 401 and no change; an unknown key gets 404; a late `PENDING` report after `DELIVERED` leaves `DELIVERED`. Verifies **AC-15**.
- Auth: a non admin gets 403 on `PUT /api/sms-settings` and no `verifyToken` or `tokenLast4` on GET; non `DRAFT` PATCH and DELETE get 409. Verifies **AC-2**, **AC-5**.
- Not configured: a tenant with no settings gets the notice and 409 on test send, preview, and send. Verifies **AC-3**.
- Secrets: the settings row in the DB holds `k<N>:` ciphertext, no response or log contains the token, and `rotate:keys` moves it to the new key. Verifies **AC-18**.

## Build plan

Tracer Bullet: Slice A proves the whole thread (settings → NextSMS → a real phone → a delivery report) with one message before campaigns are touched. Slice B thickens it into campaigns, and Slice C adds tracking.

**Slice A: one message, end to end**

1. Write the migrations for the full target model in one go: the tenant migration (new `sms_settings` with its unique `singleton`; new columns on `sms_campaigns`, `sms_messages`, and `sms_delivery_events`, the full `audience` default, and the `batchRef` and `(status, lastPolledAt)` indexes) and the catalog migration (`tenant_projects.smsWebhookKey`, unique). Run them through the existing tenant fan out. Satisfies **AC-1**, **AC-5**, **AC-11**, **AC-15**, **AC-16**.
2. Add purpose bound `encryptSecret` and `decryptSecret` (bound data `<orgId>|<purpose>|<keyId>`) to `worker/lib/crypto.ts` on the existing keyring, leaving connection string behaviour unchanged. Extend `rotate:keys` (spec 0003) to open each tenant (by decrypting its connection string) and re-encrypt its `sms_settings` row, skipping and reporting unreachable tenants so the old key isn't retired while any row still uses it. Note this in its runbook. Satisfies **AC-18**.
3. Extract `getTenantDbForOrg(env, orgId, ctx?)` from `tenant-resolver.ts`, returning the result type (the middleware then calls it), and add `worker/lib/sms-webhook-keys.ts` for the three catalog operations. Satisfies **AC-15**, **AC-16**.
4. Add `normaliseTzMobile` to `packages/shared-schema` and switch the client's `utils.ts` to it. Add `worker/lib/nextsms.ts`: typed `sendMulti`, `sendSingle` (with a test mode flag), `getBalance`, `getReports`, `getLogs`, and `mapSendReplyStatus` and `mapReportStatus`. Every call sends the `Accept` header and turns NextSMS errors into typed results that separate "refused" (401, 422) from "unknown outcome" (network error, timeout, 429, 5xx). Satisfies **AC-4**, **AC-8**, **AC-12**.
5. Add the `sms-settings` route (GET, PUT with the token and sender ID checks and the safe catalog key write, balance) and the "SMS" page in the organization settings dialog next to branding (token field, sender ID, webhook URL and verify token with copy buttons, the account changed warning, balance). Satisfies **AC-1**, **AC-2**, **AC-18**.
6. Add `POST /api/campaigns/test-send` (with the KV rate limit and the balance check) and wire the send step's "Send test" box (TZ placeholder number, result shown inline). Add the "SMS is not set up" notice to the compose flow. Satisfies **AC-3**, **AC-4**.
7. Add `POST /api/webhooks/nextsms/:key` (miss caching, verify, 200, then `waitUntil`), then prove it by configuring the webhook on a real NextSMS account and watching a test send reach `DELIVERED`. Satisfies **AC-15**.

**Slice B: campaigns**

8. Add the batched `findDueItemsForContacts` (with `findDueItemsForContact` delegating to it) and `worker/lib/sms-audience.ts` (segment and ordering, include and exclude, the AC-8 rules with "nothing due" checked before rendering, rendering with the real `renderMessageTemplate` signature, `computeSmsSegments`, and the send mode choice). Satisfies **AC-6**, **AC-7**, **AC-8**, **AC-9**.
9. Add campaign POST, PATCH, and DELETE (both conditional updates) and `audience-preview`, with zod schemas in `packages/shared-schema` (`audience` with defaults, plus the `timing_required` and `type_mismatch` checks). Update the existing GET to exclude `isDeleted`, count with SQL `GROUP BY`, and use the shared count meanings. Satisfies **AC-5**, **AC-6**, **AC-7**, **AC-17**.
10. Wire the compose flow to real data. The content step saves name, type, template, and body (picking a template freezes `reminderTiming` into the audience). The audience step shows the real segments, the resolved list with untick, and client search. The send step shows the preview, cost, balance, and Send. Opening a draft from the dashboard loads it. Remove the mock pieces: the random recipient count, the "Pro" badges, the group and custom CSV options, the scheduled and recurring options, and the fake timezone list. Satisfies **AC-5**, **AC-6**, **AC-7**, **AC-10**.
11. Add `POST /api/campaigns/:id/send` (the cap, the balance margin, and the claim update with one send at a time), the `SMS_SEND_QUEUE` binding and the queue and DLQ config, the send and dead letter consumers (`worker/queue/send-sms.ts`) with `submitAttemptedAt` crash safety, matching by `to`, guarded bulk updates, and finalise, and the `batch.queue` dispatch in `index.ts`. Satisfies **AC-10**, **AC-11**, **AC-12**, **AC-13**, **AC-14**.

**Slice C: tracking**

12. Add `GET /api/campaigns/:id` (counts and paged messages) and the campaign detail sheet. Clicking a dashboard row opens the sheet for sent campaigns and the compose flow for drafts. Satisfies **AC-17**.
13. Add the cron trigger, the `scheduled` export, `worker/cron/sms-delivery-sweep.ts` (lists tenants, enqueues one sweep per tenant), the `sms-sweep` queue, and `worker/queue/sms-sweep.ts` (report polling ordered by `lastPolledAt`, 72 hour expiry, the 10 minute re-enqueue, and the 2 hour `SENDING` cleanup). Satisfies **AC-13**, **AC-16**.
14. Add NextSMS integration notes to `context/library-docs.md` (v2 Bearer auth, the `Accept` header, the 500 limit, the 24 hour duplicate rule, no webhook retries), add the `sms-webhook-keys.ts` catalog exception to the root `AGENTS.md` middleware rule, and update `context/ui-registry.md`, `context/progress-tracker.md`, and the route list in `context/architecture.md`. Satisfies **AC-18** (records the secret handling rules for future work).

## Consequences

**Positive**:

- Each company sends under its own sender ID and pays from its own balance. ArdhiFlow never holds SMS credit or meters usage.
- Reminders are personal and accurate on the day they are sent, built from the same tested due items engine as the template preview.
- Sends survive Worker restarts and NextSMS blips, and a crash after submission cannot double message clients.
- Delivery status converges even though NextSMS never retries its webhook.

**Negative / tradeoffs**:

- Setting up each tenant is manual: you create the NextSMS account and sender ID, enable bulk sending, and the admin pastes the webhook URL and token. There is no reseller API to automate it.
- Any member can send to every client. The only limits are the balance check and the `sentBy` record; there is no approval step.
- The catalog now has a second writer path (the SMS settings route through `sms-webhook-keys.ts`), a deliberate, narrow exception to the middleware rule that has to stay narrow.
- Key rotation now also covers every tenant's `sms_settings` row, so `rotate:keys` touches each tenant DB, not just the catalog.
- NextSMS refuses a whole request whose first message matches one sent in the last 24 hours. Identical text now goes through `/text/single`, but sending the same personalised reminder again to the same first client within a day still fails that chunk (it shows as `FAILED` with the NextSMS reason).
- Crash safety fails closed: when a chunk's fate can't be confirmed, its rows show `FAILED` 'unconfirmed, check NextSMS' even if some were actually delivered, and staff resend by hand. Better a rare false failure than a double message to a client.
- Only one campaign per tenant sends at a time, so a second campaign waits a few minutes.
- The send endpoint resolves and renders up to 5,000 recipients inside one request, which needs the Workers Paid plan. Larger lists would need resolution moved into the queue.
- The project's soft delete convention (`isDeleted`) is followed for drafts, rather than an archive timestamp.

**Neutral**:

- `SCHEDULED` and the scheduled and recurring UI are removed or unused until a scheduling spec exists.
- New Worker entry points: three queue consumers (send, dead letter, sweep) and the first `scheduled` (cron) handler.
- The Tanzanian phone normaliser moves to `packages/shared-schema` and gets stricter (mobiles only), which changes how the client displays numbers that were previously accepted as landlines.
- The WhatsApp preview stays as a preview only; nothing sends over WhatsApp.

## Follow-up

- [ ] At build, against a real NextSMS account, confirm three things:
  - whether `GET /api/v2/logs?reference=` returns `messageId` per entry. If it doesn't, matched rows are marked `SENT` without an id, and the sweep can't poll them, so they expire at 72 hours;
  - whether `/test/text/single` returns a real `price`;
  - whether the 24 hour duplicate check compares `to` as well as the text.
- [ ] The cross check also suggested dropping the logs lookup entirely and always failing closed on an ambiguous retry. That's simpler, but means more 'unconfirmed' rows; revisit it if the logs check above disappoints.
- [ ] Rate limit `POST /api/webhooks/nextsms/:key` (Cloudflare rate limiting rule) alongside the existing provisioning webhook abuse item in `SCAFFOLD_NOTES.md` (scope feature 14).
- [ ] A "regenerate verify token" action for admins, in case the token leaks.
- [ ] Scheduling (`SCHEDULED`, cron pickup, East Africa Time), and later recurring sends: their own spec.
- [ ] One off "send with template" from the Reminders page (spec 0002 follow up): reuses this pipeline with `campaignId = null`.
- [ ] Spec 0003 (key rotation) should mention `sms_settings` in its rotation scope and runbook once step 2 lands.
- [ ] If you ever want staff limits (an approval step, or a per day cap), that is its own decision.
