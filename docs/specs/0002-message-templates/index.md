# 0002. Reusable message templates for the messaging flow

**Date**: 2026-09-06 **Status**: In Progress

## Summary

This spec adds a library of reusable SMS text templates that staff can create, edit, and pick from when messaging
clients, instead of typing the same reminder wording every time. It ships three ready to use payment reminder templates
(past due, due today, upcoming) written in Swahili. Templates support stand in values (a client's first name, and a
block listing what they owe) that get filled in for real when a template is used. This spec covers the templates
themselves only, not the actual sending through NextSMS (text message provider), which is a separate, larger decision
already flagged in the project's scope.

## Requirements

**User stories**:

- As an org admin, I want to create and manage a library of reusable SMS templates so that staff send consistent, on
  brand reminders without retyping them each time.
- As a staff member, I want to preview exactly what a reminder will say for a specific client before it is used, so I
  can trust the wording is right.
- As an org admin, I want the three common payment reminder templates ready to use from day one, so the team does not
  have to write them from scratch.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):

- **AC-1**: An org admin can create a template with a name, category (payment reminder, overdue notice, thank you,
  marketing, general, or custom), an optional reminder timing (upcoming, due today, past due), a channel (SMS or
  WhatsApp), and body text; it saves and appears in the template list for every staff member to see.
- **AC-2**: Three default templates (Past Due Payment Reminder, Installment Due Today Reminder, Upcoming Installment
  Reminder), using the exact Swahili wording in this spec's Feature design, exist for every tenant from first use.
- **AC-3**: A default template cannot be edited or deleted. The API rejects such a request; the UI hides those actions
  for a default template and offers "Duplicate" instead, which creates a normal, editable copy.
- **AC-4**: An org admin can edit, delete, or deactivate any non-default template. Any authenticated staff member can
  view the template list and use a template, but cannot create, edit, or delete one.
- **AC-5**: Any staff member can preview a template against one real, chosen client. The system finds that client's
  installments due in the timing this template covers, and renders the exact final SMS text plus its character count and
  SMS segment count (an SMS over 160 characters splits into more than one billed segment).
- **AC-6**: When the chosen client's matching due installments span more than one plot, one contract, or more than one
  contract across different projects, the preview combines them into a single message, one line per contract and
  installment number, rather than one message per plot or per contract.
- **AC-7**: The template editor shows a live rendered preview and the character/segment count as the admin types the
  body, using the currently selected preview client (or a placeholder client if none is chosen yet).
- **AC-8**: A template whose category is not a payment reminder (thank you, marketing, general, custom) can be created
  and previewed without a due items block; the render only fills in the tokens the body actually contains.
- **AC-9**: The existing messaging compose screen offers a "Use a template" picker. Selecting a template inserts its raw
  body text, tokens still visible as written, into the compose text box for the staff member to finish by hand. No per
  recipient substitution happens at this point; that belongs to the future send flow spec.
- **AC-10**: Deleting a non-default template soft deletes it (consistent with the rest of the app); every template list
  or lookup excludes soft deleted rows.
- **AC-11**: Previewing a template against a client with no installments due in that template's timing shows a clear
  "nothing due" message rather than a broken or empty render.

## Decision

**Chosen option**: Option 2: a `{dueItems}` block token, grouped by contract and installment number, combined into one
message per client per timing group.

## Rationale

See [rationale.md](../../../../../Downloads/files/rationale.md).

## Feature design

**Data model sketch**:

New table `message_templates` (`../../../apps/web/drizzle/tenant/schema.ts`, alongside the existing SMS tables):

| Field                    | Type                                                                             | Notes                                                                                                       |
|--------------------------|----------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------|
| `id`                     | uuid, PK                                                                         | `defaultRandom()`                                                                                           |
| `name`                   | text, not null                                                                   | admin facing label, e.g. "Past Due Payment Reminder"                                                        |
| `category`               | `SMS_CAMPAIGN_TYPE` (existing enum), not null                                    | reused as is: `PAYMENT_REMINDER`, `OVERDUE_NOTICE`, `FULLY_PAID_THANKYOU`, `MARKETING`, `GENERAL`, `CUSTOM` |
| `reminderTiming`         | new enum `REMINDER_TIMING` (`UPCOMING`, `DUE_TODAY`, `PAST_DUE`), nullable       | only set on templates whose body uses `{dueItems}`; null for thank you/marketing/general/custom             |
| `channel`                | new enum `MESSAGE_TEMPLATE_CHANNEL` (`SMS`, `WHATSAPP`), not null, default `SMS` | no WhatsApp send exists yet; this is forward looking only, see Consequences                                 |
| `body`                   | text, not null                                                                   | admin authored text containing zero or more of `{firstName}`, `{dueItems}`, `{totalAmount}`                 |
| `isDefault`              | boolean, not null, default `false`                                               | true for the three seeded templates; blocks edit/delete                                                     |
| `isActive`               | boolean, not null, default `true`                                                | hides a template from the "use a template" picker without deleting it; can be toggled on a default template |
| `isDeleted`              | boolean, not null, default `false`                                               | soft delete, same convention as `contacts`/`projects`/`plots`; forbidden while `isDefault` is true          |
| `createdBy`              | text, nullable                                                                   | Clerk user id; null for the three seeded rows                                                               |
| `createdAt`, `updatedAt` | timestamp with time zone                                                         | `defaultNow()`                                                                                              |

No foreign keys out of this table; it is looked up by category/timing at render time, not joined against.

**Rendering rule for `{dueItems}`**: the token expands to one system formatted line per
`(contractId, installmentNo, dueDate)` group (see Key invariants), joined with a single space when there is more than
one. The line format is fixed per `reminderTiming`, not admin editable (see Rationale for why):

- `PAST_DUE`:
  `Unakumbumbushwa kulipia rejesho namba {installmentNo} la {amount} kwa ajili ya plot namba: {plotNumbers} mradi wa {projectName}. Umechelewesha kulipa rejesho hili kwa siku {daysOverdue}.`
- `DUE_TODAY`:
  `Unakumbumbushwa kulipia rejesho namba {installmentNo} la {amount} kwa ajili ya plot namba: {plotNumbers} mradi wa {projectName}. Leo ndo siku ya malipo ya rejesho hili.`
- `UPCOMING`:
  `Zimebakia siku {daysRemaining} kufikia tarehe ya kulipa rejesho namba {installmentNo} la {amount} kwa ajili ya plot namba: {plotNumbers} mradi wa {projectName}.`

**The three seeded default templates** (`isDefault = true`, `channel = 'SMS'`, `category = 'PAYMENT_REMINDER'`):

| `name`                         | `reminderTiming` | `body`                                                                                                             |
|--------------------------------|------------------|--------------------------------------------------------------------------------------------------------------------|
| Past Due Payment Reminder      | `PAST_DUE`       | `Habari {firstName}, {dueItems} Tafadhari fanya malipo kuepuka tozo za adhabu au kuvunjwa kwa mkataba.`            |
| Installment Due Today Reminder | `DUE_TODAY`      | `Habari {firstName}, {dueItems} Tafadhari fanya malipo kuepuka tozo za adhabu au kuvunjwa kwa mkataba.`            |
| Upcoming Installment Reminder  | `UPCOMING`       | `Habari {firstName}, {dueItems} Tafadhali fanya malipo kwa wakati kuepuka tozo za adhabu au kuvunjwa kwa mkataba.` |

Rendered against the engineer's own sample data, the Past Due template produces exactly: "Habari James, Unakumbumbushwa
kulipia rejesho namba 3 la Tshs. 340,000 kwa ajili ya plot namba: 4,5 mradi wa Kigamboni Greens. Umechelewesha kulipa
rejesho hili kwa siku 2. Tafadhari fanya malipo kuepuka tozo za adhabu au kuvunjwa kwa mkataba." This is the acceptance
check for AC-2: build the render function first, then confirm it reproduces this string byte for byte from the matching
input data, before relying on it for any other template.

**State transitions**: none (no workflow states beyond the boolean flags above).

**API surface**:

| Endpoint                               | Method | Key inputs                                               | Key outputs                                                | Auth                    | Key errors                                                                      |
|----------------------------------------|--------|----------------------------------------------------------|------------------------------------------------------------|-------------------------|---------------------------------------------------------------------------------|
| `/api/message-templates`               | GET    | —                                                        | list of templates, `isDeleted = false`                     | any authenticated staff | —                                                                               |
| `/api/message-templates`               | POST   | `name`, `category`, `reminderTiming?`, `channel`, `body` | created row                                                | `org:admin`             | 403 not admin, 422 invalid body or `{dueItems}` without `reminderTiming`        |
| `/api/message-templates/:id`           | PATCH  | any of the create fields, partial                        | updated row                                                | `org:admin`             | 403 not admin, 422 if `isDefault` or `{dueItems}` without `reminderTiming`, 404 |
| `/api/message-templates/:id`           | DELETE | —                                                        | 204                                                        | `org:admin`             | 403 not admin, 422 if `isDefault`, 404                                          |
| `/api/message-templates/:id/duplicate` | POST   | `name?` (defaults to "`<original name>` copy")           | new, non default row                                       | `org:admin`             | 404                                                                             |
| `/api/message-templates/:id/preview`   | POST   | `contactId`                                              | `{ text, charCount, segmentCount, dueItemsFound: number }` | any authenticated staff | 404 template or contact not found                                               |

**Value sourcing** (every value each action produces, computes, or displays names where it comes from):

| Action                            | Value produced / displayed                          | Source                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
|-----------------------------------|-----------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Create template                   | `id`, `createdAt`, `updatedAt`                      | DB column defaults                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Create template                   | `createdBy`                                         | Clerk user id already attached to the request context by `clerkAuth()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Preview                           | which client                                        | `contactId` input param                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Preview                           | `{firstName}`                                       | `contacts.fullName`, first whitespace separated word                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Preview                           | which installments count as "due" for this template | reuses the same relational query shape as `installments.ts`'s existing `GET /api/installments` route (`contractInstallments.findMany` `with: { contract: { with: { client } }, plot: { with: { project } } }`), scoped to this one `contactId` via the contract's `clientContactId`, with `plotSaleContracts.status IN ('ACTIVE', 'DELINQUENT')` (same "still ongoing" pairing already used in `dashboard.ts`'s active-contract count — a contract moves to `DELINQUENT` on a missed installment, so requiring exactly `'ACTIVE'` would wrongly hide the very contracts a Past Due template needs to find) and `contractInstallments.status != 'PAID'` (broader than `dashboard.ts`'s own overdue count, which checks `status = 'DUE'` only — a `PARTIAL` installment past its due date still owes money and should still surface here), then filtered by the template's `reminderTiming` using `today = new Date().toISOString().split('T')[0]` (same pattern as `dashboard.ts`): `PAST_DUE` = `dueDate < today`, `DUE_TODAY` = `dueDate = today`, `UPCOMING` = `dueDate` within the next 3 days (matching the "Zimebakia siku 3" sample; see Follow-up on making this configurable) |
| Preview                           | one `{dueItems}` line                               | grouped by `(contractId, installmentNo, dueDate)`; a group can span more than one plot (multi plot contract) and more than one contract (multi contract client)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Preview                           | amount per group                                    | `sum(amountDue - amountPaid - waivedAmount)` across the group's installment rows, floored at 0, formatted as `Tshs. ${amount.toLocaleString('en-TZ')}` (mirrors `formatCurrency` in `src/client/lib/utils.ts`; duplicated server side since worker code cannot import client files)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Preview                           | plot numbers per group                              | `plots.plotNumber` for every installment row in the group, comma joined in ascending order                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Preview                           | project name per group                              | `projects.projectName` via the group's contract's `projectId`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Preview                           | days overdue / days remaining per group             | `today = new Date().toISOString().split('T')[0]` (the same UTC-date-string pattern `dashboard.ts` already uses for its own overdue count — no per-tenant timezone handling exists anywhere in the codebase today, so this spec doesn't add any either; see Follow-up) minus/until the group's `dueDate`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Preview                           | `{totalAmount}` (only if the body contains it)      | sum of every group's amount in the same preview                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Preview                           | `charCount` / `segmentCount`                        | computed from the final rendered text using standard GSM 7 SMS segmentation (160 chars single segment, 153 per segment once concatenated); every default template's characters are plain Latin script, so no Unicode/UCS 2 fallback is needed unless an admin later types an emoji or accented character outside GSM 7, in which case the same function switches to the 70/67 char UCS 2 rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| "Use a template" (compose screen) | inserted text box value                             | `template.body`, tokens left exactly as written, no substitution                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

**Key invariants**:

- `isDefault = true` rows are never updated or (hard or soft) deleted; only duplicated.
- A template whose `body` contains `{dueItems}` must have `reminderTiming` set — it is the only signal the
  preview/render step has for which date window (`PAST_DUE`/`DUE_TODAY`/`UPCOMING`) to query. Creating or updating a
  template with `{dueItems}` in the body and no `reminderTiming` is rejected (422).
- A `{dueItems}` group key is always `(contractId, installmentNo, dueDate)`, never just `contractId` or just
  `clientContactId` — this is what correctly folds multiple plots on one contract into one line while still splitting
  genuinely different installments or contracts into their own lines.
- Every list/lookup query filters `isDeleted = false` (no DB level enforcement, added by hand per the project's existing
  convention).

**Security model**: Multi tenant isolation is already handled by the project's one database per tenant model (no
`tenantId` column needed, matching every other table in `drizzle/tenant/schema.ts`). Within a tenant: `org:admin` (Clerk
org role, same check already used in `company-settings.ts`) is required to create, edit, delete, or duplicate a
template. Any authenticated org member can list templates and call preview. Preview only reads
contact/contract/installment data the staff member can already see elsewhere in the app; it introduces no new data
exposure.

**Configuration required**: none. No new environment variables, secrets, or third party accounts; this feature uses the
existing tenant Postgres connection only.

**Critical test scenarios** (each maps to an acceptance criterion above):

- Happy path: the three default templates come pre-seeded; a staff member opens Templates, picks "Past Due Payment
  Reminder", previews it against a client with exactly one overdue installment on one plot, and sees the correct Swahili
  text with the right amount, plot number, and project. Verifies **AC-2**, **AC-5**.
- Combine case: the same preview against a client with two overdue installments, one on a two plot contract in Project A
  and one on a single plot contract in Project B, produces one message with two due item lines, not two messages.
  Verifies **AC-6**.
- Failure case: previewing "Upcoming Installment Reminder" against a client with nothing due in the next 3 days shows
  the "nothing due" state instead of an empty or malformed message. Verifies **AC-11**.
- Auth/permission: a non-admin staff member's API call to edit or delete a template returns 403; an admin's attempt to
  edit or delete a default template returns 422 and the UI never shows those controls for it. Verifies **AC-3**,
  **AC-4**.

## Build plan

Ordered per the project's Tracer Bullet approach (prove one thin slice end to end, then thicken it):

1. Add the `message_templates` table and the two new enums (`REMINDER_TIMING`, `MESSAGE_TEMPLATE_CHANNEL`) to
   `drizzle/tenant/schema.ts`; generate and run the migration; seed the three default templates in the tenant
   provisioning path (wherever new tenant schemas are seeded today, alongside any other first run data). Satisfies
   **AC-2**.
2. Build the render engine in `apps/web/src/worker/lib/message-templates.ts`: the due items lookup (reusing the
   relational query shape already established in `installments.ts`'s `GET /` route, scoped to one contact and filtered
   per the Key invariants above) and a pure `renderMessageTemplate()` function covering the three token types and the
   GSM 7 segment counter. Satisfies **AC-5**, **AC-6**, **AC-8**, **AC-11**.
3. Build `apps/web/src/worker/routes/message-templates.ts` (list, create, update, delete, duplicate, preview), mounted
   in `src/worker/index.ts`; enforce the `org:admin` gate and default template immutability from the Security model and
   Key invariants above. Satisfies **AC-1**, **AC-3**, **AC-4**, **AC-10**.
4. Build the template management screen (new route under `_authed/_org/messaging/`, a data grid list following the
   existing `*-datagrid.tsx` pattern, plus a create/edit form with the live preview pane and character/segment counter
   from AC-7). Satisfies **AC-1**, **AC-3**, **AC-4**, **AC-7**.
5. Wire the "preview against a client" contact picker into that form, calling the preview endpoint from step 3.
   Satisfies **AC-5**, **AC-6**, **AC-11**.
6. Add the "Use a template" picker to the existing (currently unwired) `content-step.tsx` in `broadcast-flow.tsx`,
   inserting the raw body into its compose text box on selection. Satisfies **AC-9**.

One migration (step 1) covers the whole feature; it is not large enough to need slicing across steps.

## Consequences

**Positive**:

- Establishes one tested due items lookup and grouping function that the future NextSMS send flow spec can call directly
  for real bulk sends, instead of re-deriving contract/installment grouping logic from scratch.
- Staff get consistent, correct reminder wording immediately, even before any part of the actual send flow exists.

**Negative / tradeoffs**:

- Combining every due item into one message means a client with several simultaneously due contracts gets a longer,
  multi segment (and so more costly) SMS; this spec sets no maximum length or item count cap.
- The "use a template" integration only inserts raw template text into the compose box; it does not personalize per
  recipient. Staff must still finish the message by hand until the real send flow ships.
- `MESSAGE_TEMPLATE_CHANNEL` includes `WHATSAPP` ahead of any WhatsApp sending capability existing, so that value will
  sit unused until a future integration is built.

**Neutral**:

- Default templates can be deactivated but never edited in place; customizing one always means duplicating it first, one
  extra click compared to a direct edit.

## Follow-up

- [ ] The NextSMS send flow / campaign spec (scope feature 10's remaining decision) should call
  `findDueItemsForContact()`/`renderMessageTemplate()` from this feature rather than re-deriving grouping logic, and is
  where real per recipient bulk rendering, `sms_campaigns.templateId` snapshotting, and actual sending get designed.
- [ ] The "upcoming" window is fixed at 3 days in this spec, matching the sample. Consider making it a per tenant
  setting once real usage shows whether 3 days fits every business.
- [ ] Decide a maximum due items per message cap or a truncation rule once real client portfolios are seen in production
  (see Consequences).
- [ ] `WHATSAPP` on `MESSAGE_TEMPLATE_CHANNEL` is speculative; no WhatsApp send integration is designed or scoped
  anywhere yet.
- [ ] A second, likely more natural home for "use a template" is the existing Reminder page
  (`installments-reminder-datagrid.tsx`, backed by `GET /api/installments`), which already lists every
  overdue/due/upcoming installment per client with follow-up comments, but has no send action today. Worth a "send with
  template" row action there once the send flow exists, alongside the compose-flow picker in AC-9.
- [ ] "Today" is computed as a plain UTC date string, matching `dashboard.ts`'s existing overdue count — this can be off
  by a few hours around midnight East Africa Time (UTC+3). No part of the codebase handles this today; worth fixing
  project-wide, not just for this feature, if it ever causes a wrong-day reminder in practice.
