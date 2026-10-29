# 0005. Sales contract creation: rationale

## Context

ArdhiFlow records plot sales as installment contracts, but no contract can be created today. The `POST /api/contracts` route returns 501, with a comment that the Neon HTTP driver cannot run an interactive transaction. The Sales page also has no "New Contract" button, so the scope's description of this feature as mostly built no longer matches the code.

A contract is no longer one plot. The schema models a bucket of plots from one project (`contract_plots`), with a separate installment schedule per plot, an agent commission snapshot on the contract, and commission payout tranches. Creating one therefore writes to six tables and updates the plots, and it must succeed or fail as a whole: a contract without its installments, or two live contracts on one plot, would corrupt the receivables.

Plots have a size but no price. Staff need the price to follow from size and a rate, with room to negotiate. The tenant database is reached through the Neon HTTP driver wrapped by `createResilientNeon`, which supports `db.batch()` (one transaction made of prebuilt statements) but not interactive transactions. Tenants are real businesses in Tanzania handling their customers' money in TZS, whole shillings, with no multi currency.

The workspace is `apps/web` (React SPA plus the Hono Worker), build approach Tracer Bullet, workflow Beta.

## Options considered

### Option 1: One batched transaction, schedule from one shared pure function

The Worker validates, recomputes the whole plan with a pure function, generates all ids, and writes everything with one `db.batch()`. The client imports the same function for the review preview.

**Pros**:
- Uses what already runs: the resilient client implements the batch path and migrations use it; no new driver or dependency.
- Atomic, and the partial unique index plus a guarded `INSERT ... SELECT` turn races into a clean 409.
- Preview and stored data cannot disagree, and the maths is easy to unit test.

**Cons**:
- All rows and ids must be prepared up front, and a conditional guard cannot read results between statements.
- A large batch (up to about 1,220 installments) is one big request, hence the caps.

### Option 2: Neon WebSocket pool with a real interactive transaction

Open a pooled connection per request and run a normal `BEGIN ... COMMIT` with reads between writes.

**Pros**:
- Most natural code, and read then write checks are straightforward.

**Cons**:
- A second connection path in the Worker, outside `c.get('tenantDb')` and the password refresh logic that spec 0003 added.
- Per request connection setup and pool lifecycle in a Worker; the repo rule is to open tenant connections only through the one lookup.

### Option 3: A Postgres function doing the whole write

Call one SQL function with the inputs and let the database build schedules and rows.

**Pros**:
- Truly atomic and one round trip.

**Cons**:
- The schedule and commission maths would live in SQL, away from the TypeScript the preview uses, which invites the two to drift.
- The function has to be migrated to every live tenant, and it is harder to test with the current Vitest setup.

## Rationale

Option 1 is chosen because the platform already offers atomic batches and the hard parts of this feature are rules, not plumbing. The main forces are: money correctness (a half written contract is the worst failure), a single tenant connection path, and a team that would rather debug TypeScript than SQL at 5pm on a Tuesday. The apparent weakness of a batch, no read between statements, is covered by two database level guards that already exist or are cheap: the partial unique index on `contract_plots` stops two live contracts per plot, and a guarded `UPDATE` of the plots, run first so it locks their rows, followed by inserting contract plots only for the plots it claimed, makes a plot that just changed state break the following foreign key and roll the batch back. A cross check on a separate model caught that the first draft guarded in the opposite order, which left a window for a concurrent edit.

Sharing the pure `buildContractPlan` function is the answer to the review step the engineer asked for. If the preview used one implementation and the server another, the two would eventually disagree, which for a payment schedule is a support nightmare. One module, recomputed on the server, removes the class of bug. Keeping amounts as whole shilling integers, with the remainder on the last installment, avoids decimal drift without a decimal library.

Pricing on the plot (size times rate) was the engineer's call and it fits land sales, where price per square metre is the quoted unit. It adds one nullable column and a field on an existing form, and it keeps one source of truth. Keeping the agreed price editable per plot, with the list price snapshot in the `CREATED` event, supports discounts without silently changing the plot's rate for everyone. The engineer chose to block unpriced plots instead of writing a rate from the contract form; that keeps the contract write limited to contract tables and the plot status update.

Runner up for the atomic write is Option 2; it becomes attractive only if a future flow needs reads between writes that a guarded insert cannot express.

## Recommended items settled by the author

- **Shared pure module**: Worker and client both import one `buildContractPlan`. Runner up: server only dry run endpoint, rejected for an extra round trip on every field change.
- **Whole shilling integers and remainder on the last installment**: simple and exact. Runner up: spread the remainder across the first installments, rejected as harder to explain.
- **Caps of 20 plots and 60 months**: keep one batch around 1,200 rows at most.
- **Future start dates allowed up to 365 days**: lets staff pre record a sale that starts later; the engineer only decided the past window.
- **Grace days and delinquent threshold not on the form**: they keep column defaults; they belong to collections rules.
- **Client picker only, no inline client creation**: the engineer's choice; keeps this write small.
- **Fallback defaults when `commission_settings` has no row**: 5, 1 and 10, matching the column defaults, so a tenant without a seeded row still works.
- **Money as numeric strings in the database, integers in the API**: matches the existing `numeric` columns.
