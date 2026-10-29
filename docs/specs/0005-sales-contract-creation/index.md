# 0005. Sales contract creation

**Date**: 2026-10-29
**Status**: In Progress

## Summary

Staff will be able to press "New Contract" on the Sales page, walk through a four step form, and save a sale in one go. The sale covers one or more plots from one project, and the app builds each plot's monthly installment schedule and the agent's commission payouts for them. A plot's price comes from a new price per sqm stored on the plot, and staff can still adjust the agreed price when they sign. The save is all or nothing (one batched database transaction), so a failed or double sale never leaves half a contract behind.

## Requirements

**User stories**:
- As a sales staff member, I want to record a plot sale from the Sales page so that the client's installment schedule exists the moment we sign.
- As a sales staff member, I want the price to follow from each plot's size and rate, with room to give a discount, so that I never re-type a price list.
- As a manager, I want the agent's commission and its payout tranches created with the sale so that commission tracking has real data.
- As a finance user, I want a sale to either be fully recorded or not at all so that the receivables never contain half a contract.

**Acceptance criteria** (the contract, each IDed and independently checkable):
- **AC-1**: The Sales page has a "New Contract" button. It opens a wide sheet with four steps in order: Client and project, Plots and prices, Terms, Commission and review. Saving closes the sheet and the new contract appears in the grid without a page reload.
- **AC-2**: Step 1 picks one existing CLIENT contact (not deleted) and one project, with a link to add a client first if none fits. The Plots step lists only that project's plots that are AVAILABLE, not deleted, and have a price per sqm. An AVAILABLE plot with no rate is shown disabled with the hint "Set a price per sqm on the plot first". A contract holds 1 to 20 plots, all from the one project. Changing the project clears the chosen plots.
- **AC-3**: Each chosen plot shows the size used (surveyed size if set, else unsurveyed size, labelled), its price per sqm, its list price (size times rate, rounded to whole shillings), and an editable agreed price (whole shillings, greater than 0) that starts at the list price. The contract total is the sum of the agreed prices.
- **AC-4**: The plot create and edit form has an optional "Price per sqm" field (a whole number of shillings, greater than 0 when set; the server rejects anything else with 422 through an explicit positive number check, because drizzle-zod does not validate `numeric`). It is stored on the plot, and the bulk plot import accepts it under the column name `pricePerSqm`. The plot create, update and bulk schemas no longer accept `availability`, `activeContractId` or `contactId` from the request body, so staff cannot break the sale invariants.
- **AC-5**: Step 3 takes the purchase plan (FLAT_RATE or DOWNPAYMENT), term in months (1 to 60), start date (default today, allowed from 365 days back to 365 days ahead, both bounds inclusive, with a visible warning when in the past; "today" is the Africa/Dar_es_Salaam date on both the client and the server), downpayment percent (DOWNPAYMENT only, a whole number from 1 to 99, with the shilling amount shown live), and cancellation fee percent (a whole number from 0 to 100, prefilled from the company default, 10 at first). A cash sale is FLAT_RATE with a term of 1.
- **AC-6**: Step 4 has an optional sales agent (SALES_AGENT contacts only), commission percent (a whole number from 0 to 100) and payout months (1 up to the term; the form clamps it when the term is lowered), prefilled from the company commission settings and editable. With an agent and a commission above 0, the contract snapshots the percent, amount and months and gets one commission payout row per tranche; the commission amount must be at least the number of months, so no tranche is 0. Without an agent, any commission fields sent are ignored and the contract stores percent 0, amount 0, months 1, and no tranche rows exist.
- **AC-7**: Before saving, step 4 shows the full installment schedule for every plot (number, due date, amount), the totals (contract value, downpayment, financed amount) and the commission tranches. These come from the same pure function the server uses, and the server recomputes everything on save, so what was previewed is what is stored.
- **AC-8**: Saving creates, in one transaction, the contract (status ACTIVE), its contract plots, every installment of every plot, the commission payouts, a `CREATED` contract event, and marks each plot SOLD with its active contract and buyer set. If any part fails, none of it is stored.
- **AC-9**: The schedule follows these rules. For DOWNPAYMENT, each plot gets installment 0 (its rounded share of the downpayment) due on the start date. Monthly installment n (1 to term) is due n months after the start date on the same day of month, clamped to the month's last day. A plot's financed amount is split evenly in whole shillings with the remainder on the last installment. For each plot, the downpayment (DOWNPAYMENT) must be at least 1 shilling and the financed amount at least the term, so no installment is 0. Rounding is half up on whole shillings, using integer maths. Each plot's schedule is sized from its own agreed price.
- **AC-10**: If a chosen plot is no longer AVAILABLE, was deleted, or already sits in a live contract, whether the validation reads already show it or it changes during the write, the save returns 409 `{error: 'plots_unavailable', plotNumbers: [...]}`, nothing is stored, and the sheet keeps the form, refreshes the plot picker, and tells the user which plots to replace.
- **AC-11**: Invalid input returns 422 `{error: 'invalid', fields: {'<path>': message}}` and stores nothing (a custom validator hook converts zod failures, since `zValidator` would answer 400): an unpriced plot, duplicate `plotId`s, plots from different projects or a project that differs from the contract's, a client that is not a CLIENT or is deleted, an agent that is not a SALES_AGENT, a term, percent, date or price out of range, payout months above the term, a commission amount below the payout months, or a downpayment or financed amount that leaves any installment under 1 shilling (the error sits on that plot's `allocatedValue`, or on `downpaymentPercent` when every plot fails). The sheet shows the messages next to the fields.
- **AC-12**: Any signed in member of the org can create a contract. A request without a valid session or org is rejected by the existing auth and tenant chain. The Clerk user id is stored as `createdBy`.
- **AC-13**: Pressing Save twice, or a retry after a timeout, can never create two contracts for the same plot. The Save button is disabled while the request runs. The client creates the contract id when the sheet opens and sends it as `id`; the server uses it as the primary key, and a repeat of the same id (a unique violation on the contract primary key) returns the existing contract with 200 instead of a 409 about the user's own plots.
- **AC-14**: The `CREATED` event records, per plot, the plot number, size used and basis (SURVEYED or UNSURVEYED), price per sqm, list price and agreed price, so a discount can be seen later.

## Decision

**Chosen option**: Option 1: One batched transaction, with the schedule built by one shared pure function.

Add `plots.price_per_sqm` and a default cancellation fee to the commission settings, replace the gated `POST /api/contracts` with a validating endpoint that recomputes everything on the server and writes it with a single Drizzle `db.batch()`, and build the four step sheet on the Sales page against the same schedule function.

**Implementation skills**: none installed apply (no community skills listed in `AGENTS.md`).

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch** (confirmed with the engineer; only the two marked columns are new, everything else exists):

| Entity | Fields used by this flow | Relationships and rules |
|---|---|---|
| `plots` | **NEW `price_per_sqm` numeric, nullable**; `surveyed_size`, `unsurveyed_size`, `availability`, `active_contract_id`, `contact_id`, `is_deleted` | N:1 project. On sale: `availability = SOLD`, `active_contract_id` = contract, `contact_id` = client. No Drizzle level FK on `active_contract_id` (project rule). |
| `commission_settings` | `default_commission_percent`, `default_payout_months`, **NEW `default_cancellation_fee_percent` numeric not null default 10** | At most one row per tenant. If the row is missing, code falls back to 5, 1 and 10. |
| `plot_sale_contracts` | `project_id`, `client_contact_id`, `created_by`, `status`, `start_date`, `term_months`, `total_contract_value`, `purchase_plan`, `downpayment_percent` (null for FLAT_RATE), `downpayment_amount`, `financed_amount`, `cancellation_fee_percent`, `sales_agent_contact_id`, `commission_percent`, `commission_amount`, `commission_payout_months`. `grace_days` and `delinquent_days_threshold` keep their column defaults (0 and 1) and are not on the form. | 1:N to `contract_plots`, `contract_installments`, `commission_payouts`, `contract_events` |
| `contract_plots` | `allocated_value` = the agreed price of that plot | The partial unique index `contract_plots_plot_active_unique` allows one live contract per plot. |
| `contract_installments` | `installment_no` (0 for downpayment), `original_due_date` = `due_date`, `amount_due`, status DUE | One schedule per contract plot. |
| `commission_payouts` | `tranche_number`, `amount`, `target_month`, status PENDING, `sales_agent_contact_id` | Only when an agent is set and the commission is above 0. |
| `contract_events` | `event_type = 'CREATED'`, `meta` (per plot snapshot, AC-14), `is_internal` true | Audit trail. |

**State transitions**: a new contract starts `ACTIVE`; a plot goes `AVAILABLE` to `SOLD`. Later transitions (delinquent, completed, cancelled) belong to other features.

**Schedule and commission rules** (the pure function `buildContractPlan`, one module imported by both the Worker and the client; money is whole TZS integers, dates are `YYYY-MM-DD` strings with no time zone maths):
- Per plot: `price = agreedPrice`. FLAT_RATE: `down = 0`. DOWNPAYMENT: `down = round(price × pct / 100)`. `financed = price − down`.
- Installment 0 (DOWNPAYMENT only): amount `down`, due `startDate`.
- Installment n, 1 to `term`: `base = floor(financed / term)`; the last one is `financed − base × (term − 1)`; due `addMonths(startDate, n)` keeping the start day, clamped to the month end.
- Contract: `totalContractValue = Σ price`, `downpaymentAmount = Σ down`, `financedAmount = total − downpaymentAmount`, `downpaymentPercent` as entered (null for FLAT_RATE).
- Commission (agent set): `commissionAmount = round(total × pct / 100)`; tranche n (1 to months): `floor(amount / months)`, the last takes the remainder, `target_month` = first day of (start month + n − 1). No agent or amount 0: no tranche rows.

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/api/contracts` | POST | `id` (uuid made by the client when the sheet opens), `projectId`, `clientContactId`, `plots[{plotId, allocatedValue}]` (1 to 20, unique plot ids), `purchasePlan`, `termMonths`, `startDate`, `downpaymentPercent?`, `cancellationFeePercent`, `salesAgentContactId?`, `commissionPercent?`, `commissionPayoutMonths?` | 201 `{id, totalContractValue, downpaymentAmount, financedAmount, commissionAmount}`; 200 with the same shape when `id` already exists | existing chain, any org member | 401, 409 `{error, plotNumbers}`, 422 `{error, fields}` |
| `/api/contracts/:id` | DELETE (existing) | none | now always 409 `{error: 'Cancellation is not available yet'}` | existing chain | 409 |
| `/api/commission-settings` | GET (new, read only) | none | `defaultCommissionPercent`, `defaultPayoutMonths`, `defaultCancellationFeePercent` (latest row by `updated_at`; 5, 1 and 10 when no row) | existing chain | 401 |
| `/api/plots` | GET (existing) | none | non deleted plots with `availability`, sizes, new `pricePerSqm`, project; the sheet filters by project on the client | existing chain | 401 |
| `/api/plots`, `/api/plots/:id`, `/api/plots/bulk` | POST, PATCH (existing) | now also `pricePerSqm?` (flows from the Drizzle table through drizzle-zod) | plot | existing chain | 422 |
| `/api/contacts` | GET (existing) | none | contacts; the sheet filters CLIENT and SALES_AGENT | existing chain | 401 |

The existing `insertContractSchema` body (a raw table row) is replaced by a purpose built zod body schema for POST. The existing `GET` and `PATCH` contract routes are not changed. `DELETE` is gated with 409 because it hard deletes, cascades installments and payments, and would leave plots SOLD with no contract (there is no database foreign key on `plots.active_contract_id`); real cancellation is a separate feature.

**Server write sequence** for POST (validation reads first, then one batch):
1. Validate the body (zod, with a hook that returns the 422 shape). Read the plots, client, agent and commission settings. A plot that is missing, from another project, or has no rate is 422; a plot that is already SOLD, deleted or in a live contract is 409 straight away. The client must be a live CLIENT and the agent a live SALES_AGENT. Compute the plan with `buildContractPlan` using the stored rate and sizes for the CREATED snapshot.
2. Use the client's `id` as the contract id and generate every other row id in the Worker (`crypto.randomUUID()`), so children can reference parents inside one batch. If the contract id already exists, return it with 200.
3. `db.batch([...])` in this order: insert the contract; guarded `UPDATE plots SET availability = 'SOLD', active_contract_id = :contract, contact_id = :client WHERE id IN (...) AND availability = 'AVAILABLE' AND is_deleted = false AND project_id = :project` (this locks the plot rows, so a concurrent edit cannot slip in); insert contract plots with `INSERT ... SELECT ... FROM plots WHERE active_contract_id = :contract` (a plot the update skipped yields no row, and its installment insert then fails on the composite foreign key, rolling back the whole batch); insert installments; insert commission payouts (if any); insert the `CREATED` event.
4. Map errors by constraint name, read from the error's cause (newer Drizzle wraps driver errors): `contract_plots_plot_active_unique` or `contract_installments_contract_plot_plot_fk` means 409 (then re-read to name the plots that are no longer available); the contract primary key means the idempotent 200. Any other error is a 500 with nothing stored.

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Plot step | size used and basis | `plots.surveyed_size` if not null, else `plots.unsurveyed_size` |
| Plot step | price per sqm, list price | `plots.price_per_sqm`; list price = round(size used × rate) |
| Plot step | agreed price | form input per plot, starts at the list price |
| Terms step | cancellation fee percent default | `GET /api/commission-settings` → `commission_settings.default_cancellation_fee_percent` (10 when no row) |
| Terms step | downpayment amount shown live | derived: round(price × percent / 100) per plot, summed |
| Terms step | start date default and the allowed window | today in Africa/Dar_es_Salaam on client and server (a plain date, no time zone stored), 365 days either side, inclusive |
| Plots step | plot label and size unit | `plotNumber`, plus the surveyed number in brackets when set; size shown in sqm |
| Plots step | "add a client first" target | the Contacts page, opened in a new tab so the draft is kept; the client picker refetches on window focus |
| Commission step | percent and payout months defaults | `GET /api/commission-settings` (5 and 1 when no row) |
| Commission step | agent choices | `GET /api/contacts` filtered to `SALES_AGENT`, not deleted |
| Review step | installments, totals, tranches | `buildContractPlan(inputs)`, same module as the server |
| POST | `created_by` | `c.get('userId')` (Clerk user id) |
| POST | contract id | `id` from the client (created when the sheet opens); the idempotency key |
| POST | plot-side rows: contract plot, installment, payout, event ids | `crypto.randomUUID()` in the Worker |
| POST | `commission_amount`, tranche amounts, `target_month` | derived by `buildContractPlan` from total, percent, months, start date |
| POST | `status`, `grace_days`, `delinquent_days_threshold` | `ACTIVE` and column defaults |
| POST | CREATED event | `message` = "Contract created"; `created_by` = `c.get('userId')`; `meta` = `{plots: [{plotId, plotNumber, sizeUsed: string, basis: 'SURVEYED' or 'UNSURVEYED', pricePerSqm: string, listPrice: int, agreedPrice: int}]}` from the plots read in step 1 and the stored agreed prices (AC-14) |
| Commission read | settings row | latest row by `updated_at` (the table has no single row constraint); 5, 1 and 10 when none |
| Grid refresh | new row, plots now SOLD | TanStack Query invalidation of the contracts list and the plots list after a 201 or 200 |

**Key invariants**:
- A plot is in at most one live contract (database partial unique index) and is `SOLD` with `active_contract_id` set whenever it is in one.
- `Σ contract_plots.allocated_value = total_contract_value`; for each plot, `Σ installment amounts = allocated_value`; `downpayment_amount + financed_amount = total_contract_value`.
- All plots of a contract share the contract's `project_id`.
- Nothing is stored unless everything is stored (one `db.batch()`).
- The server never trusts client computed totals, schedules or commission; it only takes the agreed prices and the terms.
- Percents and price per sqm are whole numbers; sizes may have decimals; all money is whole shillings with half up rounding.
- Plot ownership fields (`availability`, `active_contract_id`, `contact_id`) change only through the sale write, never through the plot create, update or import routes.

**Security model**:
- Routes sit behind `clerkAuth()` then `tenantResolver()` and use only `c.get('tenantDb')`. No new access to the catalog.
- Any org member may create (a sale is day to day work); `createdBy` and the CREATED event record who. No special compliance scope; the data is business financial data, not payment card or health data.
- Money terms are validated on the server against the ranges in AC-5, AC-6 and AC-9.

**Configuration required**: none (no new env vars or bindings).

**Critical test scenarios** (each maps to an acceptance criterion):
- Happy path, one plot FLAT_RATE, term 12: contract, 12 installments, plot SOLD, event, no payouts, verifies **AC-8**, **AC-9**, **AC-14**.
- Happy path, three plots, DOWNPAYMENT 20 percent, term 6, agent with 3 tranches: each plot has installment 0 plus 6, sums match, 3 payouts, verifies **AC-3**, **AC-6**, **AC-8**, **AC-9**.
- Schedule maths: start 31 Jan gives due dates 28 Feb and 31 Mar (and 29 Feb in a leap year); an amount not divisible by the term puts the remainder on the last installment; a downpayment that makes an installment 0 is rejected, verifies **AC-9**, **AC-11**.
- Preview equals stored: the client plan and the stored rows are identical for the same inputs, verifies **AC-7**.
- Two staff save the same plot at once: one 201, one 409, no partial rows, verifies **AC-10**, **AC-13**.
- Plot sold or deleted between the reads and the batch: 409 and zero rows, verifies **AC-10**.
- Validation: unpriced plot, mixed projects, non client buyer, non agent, term 61, past date older than 365 days, verifies **AC-11**.
- Unauthenticated or no org request is rejected, and a normal member succeeds, verifies **AC-12**.
- UI: unpriced plots are disabled, changing project clears plots, a 422 and a 409 show on the form without losing input, verifies **AC-2**, **AC-10**, **AC-11**.

## Build plan

Tracer Bullet (the project default): prove one sale end to end through database, API and sheet first, then thicken.

1. Migration and plot rate: add `plots.price_per_sqm` and `commission_settings.default_cancellation_fee_percent` (generate with `db:generate:tenant`, update seed scripts, fan out with the tenant migration job), add "Price per sqm" to the plot form and the bulk import columns with a positive whole number check, and remove `availability`, `activeContractId` and `contactId` from the plot create, update and bulk schemas, satisfies **AC-4**
2. `buildContractPlan` pure function with its types (schedule, totals, commission tranches, date clamping), satisfies **AC-7**, **AC-9**
3. `GET /api/commission-settings`, and `POST /api/contracts` with validation, plan recompute, the single `db.batch()`, 409 and 422 mapping, the CREATED event, the client supplied id for idempotency, replacing the 501 gate, and gating `DELETE /api/contracts/:id` with 409, satisfies **AC-6**, **AC-8**, **AC-10**, **AC-11**, **AC-12**, **AC-13**, **AC-14**
4. Thin end to end sheet: "New Contract" button, steps 1 to 3 (client, project, plots with agreed price, terms), submit, grid refresh, for one or many plots, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-5**, **AC-8**
5. Commission step with agent and settings prefill, satisfies **AC-6**
6. Review step with the full schedule preview, the past date warning, double submit guard, and the 409 and 422 handling in the sheet, satisfies **AC-7**, **AC-10**, **AC-11**, **AC-13**
7. Update `context/progress-tracker.md` and `context/ui-registry.md`, satisfies the project rule after every feature

## Migration plan

**Strategy**: no migration needed beyond an additive schema change (two columns), no data transform.
**Phases**:
1. Generate the tenant migration, apply it to every live tenant with the fan out job, and to new tenants through provisioning.
2. Deploy the Worker and app that read the new columns, only after step 1 has reached all tenants.
**Rollback**: the new code is safe to revert alone; the extra columns can stay. Dropping them is only needed if the feature is abandoned.
**Risks**: deploying before the migration reaches a tenant makes the plot list and the settings read fail for that tenant; existing plots have no rate, so none can be sold until staff set one.

## Consequences

**Positive**:
- Sales can finally be recorded, so installments, payments, reminders, commission and statements have real data to work on.
- Price follows size and rate once, with a visible discount trail.
- One schedule function removes any chance of the preview and the stored data disagreeing.

**Negative / tradeoffs**:
- Every existing plot needs a rate typed in before it can be sold (no bulk set in this spec).
- A very small window remains between validation reads and the batch; it is closed by the guarded insert and the unique index, at the cost of a slightly unusual `INSERT ... SELECT`.
- Client statement and confirmation letter still derive price per sqm as contract value divided by size; they will drift from the stored plot rate when a discount was given (see Follow-up).
- Up to about 1,220 installment rows in one request (20 plots, 60 months) makes a large single request; this is the reason for the two caps.

**Neutral**:
- Adds one read only route and one migration.
- Introduces a shared pure module used by both the Worker and the client.

## Follow-up

- [ ] Scope row for feature 6 is stale: it says `POST /contracts` is fully built and that "New Contract" opens an empty sheet. In reality the POST returns 501 and no button exists. Reconcile the scope text when the spec is linked.
- [ ] Bulk set of price per sqm for a whole project (or a column in the plots grid). Without it, pricing hundreds of existing plots is slow; likely a new scope item.
- [ ] `DELETE /api/contracts/:id` hard deletes a contract and cascades its installments and payments, against the soft delete rule, and leaves the plot SOLD. Needs its own decision (cancellation flow) before staff can reach it.
- [ ] Settings screen for commission defaults and the default cancellation fee (today only editable in the database); belongs with feature 8.
- [ ] Align the client statement and confirmation letter price per sqm with the stored plot rate once it exists.
- [ ] Optional SMS or confirmation letter on contract creation is out of scope here.
- [ ] `GET /api/contracts` loads every installment of every contract into the list, which grows fast once real sales exist. Needs a lighter list endpoint.
- [ ] The future cancellation feature must set `contract_plots.cancelled_at` (and clear the plot's `active_contract_id`), because a plot is only freed for resale by that column, not by the contract status.
- [ ] `AGENTS.md` says the real foreign key on `plots.active_contract_id` is added in the migration SQL, but no migration does. Decide whether to add it.
- [ ] Reconcile delinquency for backdated contracts: installments created in the past start DUE and overdue, and the delinquency rules live elsewhere.
