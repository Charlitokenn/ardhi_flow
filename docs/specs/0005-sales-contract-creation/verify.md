# Verify: Sales contract creation · spec 0005 · updated 2026-10-29
_Steps derived from spec 0005 acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

Before you start: give at least three AVAILABLE plots in one project a price per sqm (Projects, open a project, edit a plot), and leave one AVAILABLE plot in that project without a rate. Have one CLIENT contact and one SALES_AGENT contact.

## UI / manual
- [ ] Open Sales → a "New Contract" button sits in the grid header → it opens a wide sheet showing four steps in order: Client and project, Plots and prices, Terms, Commission and review → AC-1
- [ ] Step 1: the client picker lists only non deleted CLIENT contacts (an agent or a deleted client never shows) → AC-2
- [ ] Step 1: "Add a client first" opens Contacts in a new tab; add a client there, come back → the new client is in the picker without reloading, and the draft is intact → AC-2
- [ ] Step 2: only that project's AVAILABLE, non deleted plots are listed; the unpriced plot is disabled with "Set a price per sqm on the plot first"; a SOLD plot never appears → AC-2
- [ ] Pick plots, go back to step 1, change the project → the picked plots are cleared → AC-2
- [ ] Pick 20 plots (or as many as exist) → further plots disable at 20 → AC-2
- [ ] Each chosen plot shows size used with its basis (surveyed size labelled "surveyed" when set, else "unsurveyed"), price per sqm, list price = size × rate rounded to whole shillings, and an agreed price prefilled with the list price; the contract total equals the sum of agreed prices → AC-3
- [ ] Lower one agreed price → a "below list" note shows; enter 0 or a decimal → Next is blocked with a message on that field → AC-3, AC-11
- [ ] Projects grid: edit a plot inline, set "Price per sqm" to 25000 → saved and shown as TZS 25,000; try 0 or 12.5 → blocked → AC-4
- [ ] Add plot dialog has an optional "Price per sqm (TZS)" field and no Availability select; the plots grid availability is a read only badge → AC-4
- [ ] Bulk import a CSV with a `pricePerSqm` column → the column auto maps and the rate is stored; a row with `pricePerSqm` 0 fails with the price message → AC-4
- [ ] Step 3: plan Flat rate or Downpayment; term outside 1 to 60 is blocked; start date defaults to today in Dar es Salaam; a past date shows the overdue warning; a date more than 365 days away either side is blocked → AC-5
- [ ] Step 3: Downpayment shows a whole number percent field (1 to 99) with the shilling amount updating live; Flat rate hides it; cancellation fee is prefilled with the company default (10 when no settings row) → AC-5
- [ ] Step 4: agent list holds only SALES_AGENT contacts; picking one shows commission percent and payout months prefilled from settings (5 and 1 when no row); lower the term on step 3 below the payout months → payout months is clamped to the term → AC-6
- [ ] Step 4 review shows every plot's schedule (number, due date, amount), the totals and the commission tranches → AC-7
- [ ] Save a 1 plot FLAT_RATE, term 12 sale → sheet closes, toast shows, the contract appears in the grid without a reload, and the plot now shows Sold with the client as owner → AC-1, AC-8
- [ ] Save a 3 plot DOWNPAYMENT 20%, term 6 sale with an agent and 3 payout months → each plot has installment 0 plus 6 monthly ones; 3 commission payouts exist → AC-6, AC-8, AC-9
- [ ] Open two browser windows on the same draft plot; save in one, then save in the other → the second shows "Plot N is no longer available", stays on step 2 with the form kept, and the plot is flagged → AC-10
- [ ] Double click Save quickly → exactly one contract is created; the button shows "Saving..." and is disabled while the request runs → AC-13
- [ ] Try to delete a contract from the grid → it fails with "Cancellation is not available yet" and nothing is removed → spec API surface (DELETE gate)

## Commands
- [ ] `pnpm -F @ardhiflow/web build` → passes → all
- [ ] DB after the 1 plot sale: `select status, created_by, total_contract_value, downpayment_amount, financed_amount, commission_percent, commission_amount, commission_payout_months from plot_sale_contracts where id = '<id>'` → ACTIVE, the Clerk user id, value = agreed price, downpayment 0, financed = value, commission 0 / 0 / 1 (no agent) → AC-6, AC-8, AC-12
- [ ] DB: `select availability, active_contract_id, contact_id from plots where id in (<plot ids>)` → SOLD, the contract id, the client id → AC-8
- [ ] DB: for each contract plot, `sum(amount_due)` of its installments = its `allocated_value`, and `downpayment_amount + financed_amount = total_contract_value` → AC-8, AC-9
- [ ] DB: a sale starting 2027-01-31 with term 2 has due dates 2027-02-28 and 2027-03-31; an amount not divisible by the term puts the remainder on the last installment → AC-9
- [ ] DB: `original_due_date = due_date` and status DUE on every new installment → spec data model
- [ ] DB: `select meta from contract_events where contract_id = '<id>' and event_type = 'CREATED'` → per plot plotId, plotNumber, sizeUsed (string), basis, pricePerSqm (string), listPrice, agreedPrice; message "Contract created"; is_internal true → AC-14
- [ ] DB: tranche `target_month` = first day of the start month, then +1 month each; amounts sum to `commission_amount` → AC-6
- [ ] API: POST with a plot id from another project, a non CLIENT buyer, a non SALES_AGENT agent, term 61, a start date 400 days back, duplicate plot ids, or payout months above the term → 422 `{error: 'invalid', fields: {...}}` with the matching path, and no new rows → AC-11
- [ ] API: POST a DOWNPAYMENT 1% on a 20 shilling plot, term 12 → 422 on `downpaymentPercent` (every plot fails) → AC-9, AC-11
- [ ] API: POST the same body twice → first 201, second 200 with the same `id` and totals; only one contract row → AC-13
- [ ] API: POST without a session → 401; with a session but no active org → rejected by the existing chain → AC-12
- [ ] API: PATCH /api/plots/:id with `{"availability":"SOLD"}` or `{"activeContractId": "..."}` → the field is ignored (not stored); with `{"pricePerSqm":"0"}` → 422 → AC-4

## Value sourcing (one per row of the spec table)
- [ ] Size used: a plot with both sizes uses the surveyed one (labelled surveyed); clear the surveyed size → the unsurveyed size is used → Plot step, size used and basis
- [ ] List price: a plot of 512.75 m² at 25,000/m² shows TZS 12,818,750 (rounded half up) → Plot step, price per sqm and list price
- [ ] Agreed price: starts at list price, an edit is what gets stored as `allocated_value` → Plot step, agreed price
- [ ] Cancellation fee default: delete the tenant's commission settings row (or use a tenant without one) → 10; set the row's `default_cancellation_fee_percent` to 7 → the sheet prefills 7 → Terms step default
- [ ] Downpayment live amount: 3 plots at 1,000,005 / 999 / 3,333,333 with 15% → the shown amount equals the sum of each plot's rounded share, and matches the stored `downpayment_amount` → Terms step, downpayment amount
- [ ] Start date and window: between 21:00 and 23:59 UTC (00:00 to 02:59 in Dar es Salaam) the default is already the next calendar day, and the server accepts it → Terms step, start date default and window
- [ ] Plot label: a plot with a surveyed number shows "Plot 12 (S-45)"; size in m² → Plots step, label and unit
- [ ] Add a client target: opens /contacts in a new tab and the picker refetches on focus → Plots step, "add a client first"
- [ ] Commission defaults: settings row 7% / 4 months → prefilled; no row → 5% / 1 → Commission step defaults
- [ ] Agent choices: a deleted SALES_AGENT does not appear → Commission step, agent choices
- [ ] Review equals stored: compare every row on the review step against `contract_installments` and `commission_payouts` for the saved contract → identical → Review step and AC-7
- [ ] `created_by` on the contract and the CREATED event is the signed in Clerk user id → POST, created_by
- [ ] Contract id: the stored contract id equals the `id` the sheet sent (network tab) → POST, contract id
- [ ] Other row ids are generated server side (all distinct uuids) → POST, row ids
- [ ] Commission amount and tranches: total 20,833,334 at 5% over 3 months → 1,041,667 split 347,222 / 347,222 / 347,223 → POST, commission
- [ ] Status and defaults: `status` ACTIVE, `grace_days` 0, `delinquent_days_threshold` 1 → POST, status and defaults
- [ ] Commission read: with two settings rows, the most recently updated one wins → Commission read
- [ ] Grid refresh: after a 201 the contracts grid and the project's plot list update without a reload → Grid refresh

## Acceptance-criteria coverage
- AC-1 covered by the first UI step and the 1 plot sale · AC-2 by the client, picker, project change and 20 limit steps · AC-3 by the chosen plot and agreed price steps · AC-4 by the plot edit, add dialog, CSV and PATCH steps · AC-5 by the two step 3 steps · AC-6 by the step 4 defaults, 3 plot sale and tranche DB steps · AC-7 by the review steps · AC-8 by both sales and the DB row checks · AC-9 by the schedule and rounding DB steps · AC-10 by the two window step · AC-11 by the 422 API steps · AC-12 by the auth API step and `created_by` · AC-13 by the double click and repeat POST steps · AC-14 by the CREATED event step
