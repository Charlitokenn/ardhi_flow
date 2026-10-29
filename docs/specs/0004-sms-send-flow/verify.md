# Verify: sms-send-flow · spec 0004 · updated 2026-10-28
_Steps derived from spec 0004 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Scope of this file: **Slice A** (one message, end to end), **Slice B** (campaigns) and **Slice C** (tracking).

Before you start: apply `drizzle/catalog/migrations/0002_sms_webhook_key.sql` (`pnpm -F @ardhiflow/web db:migrate:catalog`), then fan out `drizzle/tenant/migrations/0008_sms_send_flow.sql` (`npx tsx scripts/migrate-tenants.ts` from `apps/web`). You need a real NextSMS account with an approved sender ID enabled for bulk sending, and a phone you can read.

## Database
- [ ] Catalog: `tenant_projects.sms_webhook_key` exists, text, nullable, with a unique constraint → AC-1, AC-15
- [ ] Tenant: `sms_settings` exists with a unique `singleton` column; `sms_campaigns` has `template_id` (FK to `message_templates`, on delete set null), `audience` (not null, full default), `skipped`, `sent_at`, `sent_by`, `is_deleted`; `sms_messages` has `batch_ref`, `submit_attempted_at`, `last_polled_at`, `provider_status` plus indexes `sms_messages_batch_ref_idx` and `sms_messages_status_last_polled_idx`; `sms_delivery_events.source` defaults to `'webhook'` → AC-1, AC-5, AC-11, AC-15, AC-16
- [ ] Existing campaigns still load on `/messaging/broadcasts` after the migration (audience default applied to old rows) → AC-5

## UI / manual
- [ ] As an org admin, open the organization settings dialog, Settings, SMS tab. Save a wrong token → the page says NextSMS rejected it, and no `sms_settings` row exists → AC-1
- [ ] Save a valid token with a sender ID NextSMS doesn't know → "NextSMS rejected the sender ID" → AC-1 (Value sourcing: sender ID validity)
- [ ] Save a valid token and the real sender ID → webhook URL `<app origin>/api/webhooks/nextsms/<key>` and a verify token appear, each with a working copy button, plus the paste instruction. The token field shows `•••• <last 4>` → AC-1 (Value sourcing: webhookUrl, tokenLast4)
- [ ] Reload the dialog and check the network tab: no response contains the full API token → AC-1, AC-18
- [ ] Save again with a different valid token → the "different NextSMS account" warning shows, and the webhook URL and verify token are unchanged → AC-1 (Value sourcing: accountChanged, webhookKey reuse)
- [ ] The balance on the SMS tab matches the NextSMS dashboard → AC-2 (Value sourcing: balance)
- [ ] On a tenant with no SMS settings, open the compose flow: the "SMS is not set up" notice shows. As an admin, "Open SMS settings" opens the dialog on the Settings page's SMS tab; as a member, it says to ask an admin → AC-3
- [ ] Pick the "Past Due Payment Reminder" template, go to the send step, type a real number as `0712 345 678`, press Send Test → "Sent", and the phone receives the sample client text (James, a past due line) from your sender ID → AC-4 (Value sourcing: test send text, due items, phone)
- [ ] Type `0222 123 456` (a landline) → "Enter a Tanzanian mobile number" and no NextSMS call → AC-4
- [ ] Paste the webhook URL and verify token into NextSMS (Customer Profile, Customization, Webhooks). Send another test → within minutes the `sms_messages` row moves to `DELIVERED` with `delivered_at` set, and an `sms_delivery_events` row with `source = 'webhook'` holds the payload without `token` → AC-15 (build plan step 7's proof)
  - Proven on dev 2026-10-29 (TAJ Homes, through a `cloudflared` tunnel): test send `374065709652649561` was accepted (`ENROUTE (SENT)`, cost 16, 1 segment), and 10 minutes later the webhook moved it to `UNDELIVERED` with an `sms_delivery_events` row (`source = 'webhook'`, no `token` in the payload). The webhook path is proven. NextSMS reported the message `UNDELIVERABLE`, so a real `DELIVERED` is still unseen: check the sender ID is active for that network and the number is right, then send again before you tick this line.

## Commands
- [ ] `curl -i -X POST <origin>/api/webhooks/nextsms/not-a-key -d '{}'` → 404 → AC-15
- [ ] Same with the real key and `{"token":"wrong","messageId":"1","status":"DELIVERED"}` → 401, no event row → AC-15
- [ ] Real key, right token, `"messageId":"999"` (unknown) → 200, nothing written → AC-15
- [ ] Real key, right token, the delivered message's id, `"status":"PENDING"` → 200, an event row is added, the message stays `DELIVERED` → AC-15
- [ ] As a non admin: `PUT /api/sms-settings` → 403; `GET /api/sms-settings` → `configured`, `senderId` only (`tokenLast4`, `webhookUrl`, `verifyToken` are null); `GET /api/sms-settings/balance` → the balance → AC-2
- [ ] Tenant with no settings: `POST /api/campaigns/test-send` → 409 `sms_not_configured`; `GET /api/sms-settings/balance` → 409 → AC-3
- [ ] Body containing `{dueItems}` with no `reminderTiming` → 422 `timing_required` → AC-4 (Value sourcing: reminderTiming)
- [ ] Test send with a `contactId` of a client with a past due installment and `reminderTiming: "PAST_DUE"` → the text uses that client's first name and real amounts → AC-4 (Value sourcing: first name, due items)
- [ ] 11th test send within one UTC hour by the same member → 429 `rate_limited`; a different member can still send → AC-4
- [ ] With a NextSMS balance of 0 (or a mocked `NEXTSMS_BASE_URL`), test send → 422 `insufficient_balance` → AC-4
- [ ] `select api_token_encrypted, webhook_verify_token_encrypted from sms_settings` → both start with `k<N>:` → AC-18
- [ ] Copy one tenant's `api_token_encrypted` into the verify token column (on a throwaway tenant) → the settings page fails to decrypt instead of showing a value (bound data includes the purpose) → AC-18
- [ ] Worker logs (`wrangler tail`) during a settings save and a test send show org id, sender id, status and the last 3 digits only: no token, no message text, no full number → AC-18
- [ ] `npx tsx scripts/rotate-keys.ts --dry-run` lists the tenant under "SMS secrets"; after adding a new current key, a real run moves both values to it (prefix changes), and the settings page still works → AC-18

## Slice B: campaigns (added 2026-10-28)

Before you start: create the queues once (`npx wrangler queues create sms-send` and `npx wrangler queues create sms-send-dlq`) before deploying. Locally the Vite dev server simulates them. Use a tenant with SMS set up, and a few test clients whose numbers you control.

### UI / manual
- [ ] New campaign, give it a name, type a plain message with no template, pick type Marketing, Save draft → it appears on the dashboard as DRAFT. Edit it from the row menu → the flow reopens with the same name, type, text and audience → AC-5
- [ ] Delete a draft from the row menu → a confirm dialog, then it disappears from the dashboard (the row still exists with `is_deleted = true`) → AC-5
- [ ] Pick the "Past Due Payment Reminder" template → the type locks to Payment reminder and the audience step offers "Clients with past due installments". Unlink the template → the type unlocks and the audience falls back to "All clients" → AC-6 (Value sourcing: type, reminderTiming)
- [ ] Audience step: untick a client → they move to "Removed by hand", the count drops, and saving keeps them out after reopening. Add a client through the search → they appear at the end of the list → AC-6
- [ ] With a Marketing campaign: an opted out client, a client with no number, and two clients sharing one number show under Skipped with the right reasons (the older contact keeps the shared number). Switch the same campaign to a Payment reminder template → the opted out client is now included → AC-7, AC-8 (Value sourcing: opt out applies, phone)
- [ ] A hand added client who owes nothing, in a past due reminder → skipped as "Nothing due", never sent → AC-8
- [ ] Review & Send shows recipients, total SMS parts, skipped per reason, estimated cost in TZS and the live balance; changing the audience changes them → AC-7 (Value sourcing: estimated cost, balance)
- [ ] With a balance below estimate plus 2%, Send Campaign is disabled and a warning explains why → AC-10
- [ ] Send a past due reminder to 3 test clients → toast, back to the dashboard, the campaign goes SENDING then SENT, and each phone receives its own name and amounts → AC-9, AC-11, AC-12, AC-13 (Value sourcing: message text, first name, due items)
- [ ] Each `sms_messages` row: `body` is exactly the received text, `phone_number` is bare `255XXXXXXXXX`, `status = SENT` with `provider_message_id`, `cost`, `segments_count`, `sent_at`, `batch_ref = c<id without dashes>-0`; the campaign has `recipient_count`, `skipped`, `sender_id`, `sent_at`, `sent_by` → AC-9, AC-11, AC-12 (Value sourcing: senderId, sentBy, sentAt, providerMessageId)

### Commands
- [ ] `PATCH` or `DELETE /api/campaigns/<sent id>` → 409 `not_draft` → AC-5
- [ ] `POST /api/campaigns` with a `{dueItems}` body and no template → 422 `timing_required`; with a reminder template but `type: "MARKETING"` → 422 `type_mismatch` → AC-6
- [ ] `POST /api/campaigns/audience-preview` twice, changing a contact's number in between → the second result reflects it (worked out at call time) → AC-7
- [ ] Two parallel `POST /api/campaigns/<draft id>/send` → exactly one 202, the other 409 `not_draft`, and messages are created once → AC-11
- [ ] While one campaign is SENDING, send another → 409 `another_send_in_progress` → AC-11
- [ ] An audience above 5,000 → 422 `audience_too_large`; an empty audience → 422 `empty_audience`; balance short → 422 `insufficient_balance` and no rows → AC-10, AC-11
- [ ] Identical marketing text (no tokens) to more than 500 clients goes out as several `/text/single` chunks, none refused as a duplicate (point `NEXTSMS_BASE_URL` at a mock to count calls) → AC-11, AC-12 (Value sourcing: send mode)
- [ ] With a mock NextSMS that rejects one number → that row is FAILED with the NextSMS status name in `error_reason`, the rest SENT, the campaign SENT → AC-12, AC-13
- [ ] With a mock that returns 500 on every call → after the retries the chunk's rows are FAILED (`unconfirmed, check NextSMS`, since a submit was attempted) and the campaign FAILED; NextSMS was called exactly once for the chunk → AC-13, AC-14
- [ ] With a mock that accepts the submit but the consumer throws right after (or times out): the retry calls `/api/v2/logs` instead of resending; logs with entries → rows SENT; logs empty twice → rows FAILED `unconfirmed, check NextSMS` → AC-14

## Slice C: tracking (added 2026-10-28)

Before you start: `npx wrangler queues create sms-sweep` before deploying. Locally you can fire the cron by hand with the dev server's scheduled trigger (`curl "http://localhost:<port>/cdn-cgi/handler/scheduled"`), or wait for the half hour.

### UI / manual
- [ ] On the dashboard, click a SENT campaign's name → the detail sheet opens with Sent, Delivered and Failed matching the grid's columns, the raw counts (queued, not delivered, no report), the skip counts, and the recipients with name, number, status, error and time → AC-17 (Value sourcing: detail counts, recipient name)
- [ ] Click a DRAFT's name → the compose flow opens with that draft instead → AC-17
- [ ] A campaign with more than 100 messages pages through the recipients 100 at a time → AC-17
- [ ] Delete a contact who received a campaign → the sheet shows "Removed contact" for that row → AC-17
- [ ] While a campaign is SENDING the sheet refreshes on its own every 10 seconds → AC-17

### Commands
- [ ] Turn off the NextSMS webhook, send a test or campaign, wait at least 15 minutes, then fire the cron → the message moves to DELIVERED with an `sms_delivery_events` row where `source = 'poll'`, and `last_polled_at` is set → AC-16
- [ ] With 450 messages pending in SENT (seed them), three sweeps poll all of them, oldest `last_polled_at` first (none polled twice before every one is polled once) → AC-16
- [ ] Set a SENT message's `sent_at` to 73 hours ago and fire the cron → it becomes EXPIRED with `error_reason = 'no delivery report'` → AC-16
- [ ] Orphaned send: insert QUEUED rows for a SENDING campaign (with `batch_ref`, no `submit_attempted_at`, `created_at` 11 minutes ago) without enqueueing, then fire the cron → the chunk is enqueued, sent, and the campaign finalised → AC-13
- [ ] Enqueue the same chunk twice (or let the sweep re-enqueue one still waiting) → only one run submits it (the other finds no rows to claim and checks the logs); NextSMS is called once → AC-13, AC-14
- [ ] Set a SENDING campaign's `sent_at` to 3 hours ago with QUEUED rows left → after a sweep those rows are FAILED `send timed out` and the campaign is finalised; no campaign stays SENDING past 2 hours → AC-13
- [ ] A late PENDING report from the sweep after DELIVERED leaves the message DELIVERED (an event row is still added) → AC-15, AC-16
- [ ] `wrangler tail` during a sweep shows org id and counts only → AC-18

## Acceptance-criteria coverage
- AC-1: settings save steps (UI 1 to 5), Database
- AC-2: balance step, non admin command
- AC-3: notice step, not configured command
- AC-4: test send UI steps, timing, contact, rate limit, balance commands
- AC-15: webhook proof step, the four webhook commands
- AC-18: network tab check, ciphertext prefix, bound data, logs, rotation
- AC-5: draft save, reopen, delete, not_draft commands
- AC-6: template type and timing, audience edits, timing_required and type_mismatch
- AC-7: preview contents, preview at call time
- AC-8: skip rules by type, nothing due
- AC-9: per recipient text, stored body
- AC-10: disabled Send, insufficient_balance
- AC-11: claim once, one send at a time, caps, chunking
- AC-12: accepted and rejected rows
- AC-13: campaign SENT or FAILED, orphaned send re-enqueue, 2 hour timeout
- AC-14: crash safety with logs
- AC-16: sweep polling, rotation by last polled, 72 hour expiry
- AC-17: detail sheet steps, draft opens the compose flow
