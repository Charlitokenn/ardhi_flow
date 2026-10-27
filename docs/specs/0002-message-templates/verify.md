# Verify: Message templates · spec 0002 · updated 2026-10-27
_Steps derived from spec 0002 acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

Setup: run the dev server from `apps/web` (`pnpm exec vite --port 5199`). Sign in to TAJ Homes as an `org:admin`, and for the permission steps as a plain `org:member`. The seeded data has two past due clients (Said Massawe, Asha Mdoe, each with one PARTIAL installment on a DELINQUENT contract). Fatuma Nyerere has the AC-6 shape (a two plot contract in one project plus a one plot contract in another) but nothing due yet; the AC-6 steps need two of her installments moved into the past first (one per contract), and moved back after.

## UI / manual
- [x] Open `/messaging/templates` as admin → the three defaults show, each with a Default badge and Swahili body exactly as in the spec → AC-2
- [x] New Template → fill name, pick each category, a timing, channel WhatsApp, a body → Create template → toast "Template created", the row shows in the list; sign in as a member → the same row shows → AC-1
- [x] New Template with `{dueItems}` in the body and "No timing" → Create template → inline error "Required when the body uses {dueItems}", nothing saved → AC-1, Key invariants
- [x] Open the actions menu on a default row as admin → only Preview and Duplicate; Duplicate → a "<name> copy" row appears whose menu has Edit and Delete → AC-3
- [x] Switch a default row's Active switch off, reload, switch it back on → saves both times, no error toast, name and body unchanged → spec data model (isActive on a default)
- [x] As admin on a non default row: Edit and save, switch Active off, Delete and confirm → each saves, the deleted row leaves the list → AC-4, AC-10
- [x] As a member: the actions menu shows only Preview, the Active switch is disabled; New Template then Create template → toast "Only an org admin can manage message templates", nothing saved → AC-4
- [x] As a member, Preview on "Past Due Payment Reminder" → pick Asha Mdoe → "Habari Asha, Unakumbumbushwa kulipia rejesho namba 8 la Tshs. 750,000 kwa ajili ya plot namba: 6 mradi wa Kigamboni Greens. Umechelewesha kulipa rejesho hili kwa siku <days since 2026-10-16>. …", with its character count and 2 SMS segments → AC-5
- [ ] With Fatuma's two installments moved into the past, preview "Past Due Payment Reminder" against her → one message with two due item lines: plots `4,5` on the first project and plot `2` on the other, never two messages → AC-6
- [x] In the editor, pick a client, then keep typing in the body → the rendered text and counts update within about half a second → AC-7
- [x] In the editor with no client picked → the picker reads "Sample client (James)"; the Past Due default body with timing Past Due renders exactly the AC-2 sample string, 243 characters, 2 segments → AC-7
- [x] Still on the sample, keep typing in the body → the sample render and counts update within about half a second → AC-7
- [x] Pick a real client → their real render replaces the sample; close and reopen the editor → it starts on the sample again → AC-7
- [x] On the sample, switch timing to Upcoming → the line reads "Zimebakia siku 3 …"; switch to Due Today → "… Leo ndo siku ya malipo …" → Value sourcing (sample due items)
- [x] On the sample, a General body with no timing, `Asante {firstName} {totalAmount}` → "Asante James Tshs. 0", and no "nothing due" note → AC-8, Value sourcing (sample `dueItemsFound`)
- [x] Create a General template "Asante {firstName} kwa kuwa nasi." with no timing → preview against Said → "Asante Said kwa kuwa nasi." → AC-8
- [x] Reminder page → Message Broadcast → Create Campaign → Use a template → only active SMS templates are listed; pick one → the compose box holds the raw body with `{firstName}` and `{dueItems}` still visible; switch to WhatsApp → only active WhatsApp templates (or "No active WhatsApp templates yet.") → AC-9
- [x] Switch a template inactive → it disappears from the Use a template picker but stays in the template list → AC-9, spec data model (isActive)
- [x] Preview "Upcoming Installment Reminder" against Said → the "Nothing due for this client in this timing right now." note shows, not a broken render → AC-11

## Value sourcing
- [x] Create a template as admin, read it back from `GET /api/message-templates` → `createdBy` is the admin's Clerk user id; the seeded defaults have `createdBy` null → Create template · createdBy
- [ ] Preview against a contact whose full name has two or more words (and one with extra spaces) → `{firstName}` is only the first word → Preview · firstName
- [ ] Preview Past Due against Said → his installment counts even though the contract is DELINQUENT and the installment is PARTIAL; a PAID installment and a CANCELLED or COMPLETED contract never count → Preview · which installments count
- [ ] Move one test installment to today, to today plus 3 days, and to today plus 4 days → Due Today finds the first, Upcoming finds the second with "Zimebakia siku 3", nobody finds the third → Preview · timing windows
- [ ] On a two plot contract, both plots' rows for one installment number fold into one line; two installment numbers on the same contract give two lines → Preview · one dueItems line
- [ ] Amount for Said is 500,000 due minus 250,000 paid = "Tshs. 250,000"; set a waiver larger than what is owed on a test row → the line shows "Tshs. 0", never negative → Preview · amount per group
- [ ] On a contract whose plots are 10 and 9 → the line reads `plot namba: 9,10` (number order, not text order) → Preview · plot numbers
- [ ] The project name in each line matches that contract's project, not another contract's → Preview · project name
- [ ] Days overdue for Said equals today (UTC date) minus 2026-10-17; also check once between 00:00 and 03:00 East Africa Time, when the UTC date is still yesterday, and note the known one day offset → Preview · days overdue / remaining
- [ ] A template with `{totalAmount}` previewed against a client with two due lines → the total equals the sum of both line amounts; with no due items it shows "Tshs. 0" → Preview · totalAmount
- [x] Bodies of 160 and 161 plain characters → 1 and 2 segments; a body with `{` `}` `[` `]` `€` counts each as 2 characters; one emoji switches to the 70 and 67 limits (71 characters → 2 segments) → Preview · charCount / segmentCount
- [x] Use a template in the compose screen → the inserted text equals the template's stored body byte for byte → Use a template · inserted value

## Commands
- [x] `pnpm --filter @ardhiflow/web exec vitest run src/worker/routes/message-templates.test.ts` → all pass (default isActive toggle allowed, content edits on a default rejected, second delete is 404) → AC-3, AC-10
- [x] As admin: `PATCH /api/message-templates/<default id>` with `{"name":"x"}` → 422; `DELETE` a default → 422; `POST /api/message-templates/<default id>/duplicate` → 201 with `isDefault: false` → AC-3
- [x] As a member: `POST`, `PATCH`, `DELETE` and `duplicate` → 403 each; `POST /api/message-templates/preview` → 200 → AC-4, AC-5
- [x] `POST /api/message-templates/preview` with no `contactId` → 200 with the sample render, no tenant table reads; with `{dueItems}` in the body and `reminderTiming: null` → 422 → AC-7, Value sourcing
- [x] `DELETE` a non default template twice → 200, then 404; `PATCH` or duplicate it afterwards → 404 → AC-10
- [x] `POST /api/message-templates/preview` with an unknown `contactId` → 404; with `{dueItems}` and `reminderTiming: null` → 422 → AC-5, Key invariants
- [ ] `npx tsc -b`, `npx eslint .`, `npx vite build` from `apps/web` → all clean → every AC

## Acceptance-criteria coverage
- AC-1 covered by the create, list as member, and missing timing steps · AC-2 covered by the defaults list step and the byte for byte sample in the spec · AC-3 covered by the default menu, duplicate, API 422 and unit test steps · AC-4 covered by the admin edit/deactivate/delete and member steps · AC-5 covered by the member Preview step and the preview API steps · AC-6 covered by the Fatuma combine step (needs the data change) · AC-7 covered by the live typing step and the sample client steps (UI and the no `contactId` preview command) · AC-8 covered by the General template step · AC-9 covered by the compose picker and inactive template steps · AC-10 covered by the delete steps and unit test · AC-11 covered by the Upcoming against Said step
