# 0004. Send SMS campaigns: decision record

Build spec: [index.md](index.md).

## Context

> ⚠️ Premise note: any member can send a campaign to every client, while template editing and company settings are admin only. A mistaken or careless send reaches every client in a few minutes, costs real money, and cannot be recalled. This spec follows your choice and limits the damage with a balance check and a `sentBy` record. If misuse ever shows up, the right fix is an approval step or a per day cap, not tighter settings.

ArdhiFlow (scope feature 10) has the SMS schema, a template library (spec 0002), and a campaigns dashboard (spec 0003), but nothing sends. The compose flow in `apps/web` is local state over mock UI. Client communication by SMS is a core part of how Tanzanian land sale companies chase installments, so this is the gap between "tracks receivables" and "collects them".

The forces that shaped the design:

- **You are a NextSMS reseller, and each tenant has its own NextSMS account, API token, and sender ID.** Sender IDs are registered per company. The NextSMS docs describe no reseller API (no sub customer creation or recharge), so accounts are set up by hand.
- **NextSMS v2 facts**: Bearer token auth; `/text/multi` sends up to 500 different texts per request; a request is refused if its first message repeats one from the last 24 hours; the delivery webhook is one URL per account, set in the dashboard, with a plain verify token, a 5 second timeout, and no retries; a reports endpoint can be polled by message id.
- **Runtime**: a single Cloudflare Worker (Hono), with per tenant Neon databases reached only through `clerkAuth()` then `tenantResolver()`. Queues are already used for provisioning. There is no cron handler yet. Secrets at rest use the AES GCM keyring from spec 0003.
- **Personalisation**: reminder text differs per client (`{dueItems}`), so a single text to many numbers does not fit.
- **Scale**: tenants are small to mid sized companies, with hundreds to low thousands of clients each.
- **Data**: phone numbers and amounts owed are personal data that stay in the tenant DB. No regulated payments or health scope applies.

## Options considered

### Option 1: Queue backed sending, webhook plus polling sweep (chosen)

The send endpoint renders and stores `QUEUED` rows, then a new Cloudflare Queue consumer submits 500 message chunks to `/text/multi`, with retry recovery by reference. A per tenant webhook URL receives delivery reports, and a 30 minute cron polls whatever the webhook missed.

**Pros**: survives Worker restarts and NextSMS outages with retries and a dead letter queue; reuses the provisioning queue pattern; statuses converge despite the webhook never retrying; the send request returns quickly.

**Cons**: three new moving parts (a queue, a DLQ, and a cron); recovery logic for chunks that were submitted but not recorded; more to test.

### Option 2: Inline send with `waitUntil`, webhook only

The send endpoint returns and keeps calling NextSMS in the background of the same request. Delivery comes only by webhook.

**Pros**: no new bindings; the fewest files.

**Cons**: no retries, and a large list can be cut off by request limits, leaving a campaign stuck in `SENDING`; any webhook lost to a timeout or deploy leaves messages pending forever.

### Option 3: Cloudflare Workflows, polling only

Each campaign becomes a durable workflow (render, submit chunks, then sleep and poll reports until everything is final). No webhook.

**Pros**: built in durable steps and retries; no public endpoint; no per tenant dashboard setup.

**Cons**: a new primitive the project does not use yet; statuses arrive late; more API calls against each tenant's NextSMS account; Workflows' own limits and pricing to learn.

### Sub decisions settled with you

| Decision | Chosen | Runner up and why not |
|---|---|---|
| Whose account sends | Each tenant's own NextSMS account | One platform account: you would carry the SMS cost and need metering through feature 12 |
| Where credentials live | Tenant DB, encrypted with the existing keyring | Catalog: routes would have to reach the catalog for every send |
| Webhook routing | Random key per tenant in the path, plus the verify token | Org id in the path: guessable, leaving the token as the only check |
| Key lookup | Catalog column `smsWebhookKey` | KV only: not a source of truth, and the cron cannot list it |
| Missed reports | Webhook plus a 30 minute sweep, expiring at 72 hours | Webhook only: lost reports stay pending forever |
| Balance | Estimate and block when short | Warn only: half sent campaigns |
| Drafts | Saved, editable, soft deleted | Create and send in one action: thinner, but you wanted save and return |
| Draft audience | Rules, resolved at send | A frozen list: clients who paid since would still be reminded |
| Who sends / who configures | Any member sends, admins configure | Admin only sending (see the premise note) |
| End status | `SENT` once every chunk is handed over | A `PARTIAL` status: one more state for little gain |

## Rationale

Option 1 is the only one that meets both hard facts from NextSMS: the webhook never retries, and an interrupted submission must not double message clients who owe money. A queue gives retries and a dead letter queue for free, and the project already runs one for provisioning, so the operating cost is a known quantity. Option 2 fails exactly the moment a send matters most (a big list, or a NextSMS hiccup). Option 3 solves durability, but brings a new primitive and late statuses to avoid a webhook the dashboard setup already supports.

Some calls you left to me:

- **Rendering at send in the request**, not in the consumer, so the preview and the send share one code path and the balance check sees the real total. The batched due items query keeps it to a few queries. Moving it into the queue is the runner up, worth it only for much larger lists.
- **A `submitAttemptedAt` marker, failing closed**, rather than an idempotency key, because NextSMS offers no idempotency key. A chunk that may have reached NextSMS is never resent. The `/v2/logs` lookup by reference only recovers message ids when it can, so a delay in the logs can never cause a double send. Its own 24 hour duplicate refusal is a backstop, not something to rely on. (This was tightened after the cross check found that trusting the logs alone could resend when they lag.)
- **One send at a time per tenant** rather than reserving balance: the simplest way to make the balance check honest when any member can send.
- **Purpose bound encryption** (org id plus a label as the bound data), so ciphertexts cannot be swapped between columns, rather than a second keyring (your choice was to reuse the existing one).
- **Status mapping to the existing enum** rather than adding `REJECTED`: rejections become `FAILED`, and the raw NextSMS name is kept in `providerStatus` and `errorReason`.
- **Per message cost estimate from the free test endpoint**, rather than a hardcoded price, because each reseller account can be priced differently.

## References

**Project sources**:

- `AGENTS.md`: the middleware chain, soft deletes, the Hono RPC typed client, and Tracer Bullet delivery
- Spec 0002 (message templates): `renderMessageTemplate`, `findDueItemsForContact`, the sample client, and the `templateId` snapshot follow up
- Spec 0003 (connect broadcast dashboard): the read only campaigns endpoint this extends
- Spec 0003 (encryption key rotation): the `TENANT_CONN_KEYRING` format reused for the SMS secrets
- `apps/web/src/worker/queue/provision-tenant.ts` and `wrangler.jsonc`: the existing queue pattern
- `SCAFFOLD_NOTES.md`: the existing webhook abuse protection gap

**Practices & standards**:

- Transactional outbox style: write the rows first, then deliver asynchronously with retries
- Idempotent consumers, with recovery by external reference before any retry
- Constant time comparison for shared secrets
- Monotonic state machines (final states never move back)

**Links** (checked during the design conversation, 2026-10-27):

- NextSMS API docs: https://nextsms.co.tz/api-docs
- NextSMS v2 API reference (full text): https://nextsms.co.tz/api-docs/llms
- NextSMS OpenAPI document: https://nextsms.co.tz/api-docs/openapi
- NextSMS v1 (legacy Basic auth) reference: https://nextsms.co.tz/api-docs/llms?version=v1
