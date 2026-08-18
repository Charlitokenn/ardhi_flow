# 0002. Contact view sheet wiring and detail data endpoint

## Summary

The view sheet already opens the right component, but shows the wrong contact and has no data to show. This fixes the wiring bug and adds one endpoint that returns a contact together with its plots, each plot's project, and each plot's latest contract with its payments and installments, which the statement (0003) and the confirmation letter (0004) both consume.

## Context

`contacts-datagrid.tsx` opens a sheet on `isViewSheetOpen` (driven by `viewingRow`) but renders `<ViewContactForm contact={editingRow}/>`, the row from the separate edit flow. `ViewContactForm` also expects a `contact: ClientContact` prop shaped with nested `plots`, each with `project`, `contracts`, `activeContract.payments`, and `activeContract.installments` — a type that is not declared anywhere in the codebase, and a shape the existing `GET /api/contacts/:id` (which returns only the flat `contacts` row) cannot supply. `ViewContactForm` currently also picks a contract by merging the active contract's and the first contract's payments/installments together when both exist, which double counts data when they are the same contract and is generally the wrong rule (see the umbrella's "latest contract" rule).

## Requirements

**User stories**:
- As a staff member, I want to click "View" on a contact and see that exact contact's details, not whichever contact I last edited.
- As a staff member, I want the view sheet to show a client's plots and, per plot, its current contract's payment progress, so I don't have to cross reference the Sales and Payments screens.

**Acceptance criteria**:
- **AC-1**: Clicking "View" on a contact row opens the sheet showing that row's own data; clicking "Edit" on a different row afterward does not change what the view sheet shows.
- **AC-2**: `GET /api/contacts/:id/statement-data` returns the contact plus an array of its plots, each including its project, and its latest contract (per the umbrella's "latest contract" rule) with that contract's payments, installments, and its joined sales agent contact; a contact with no plots returns an empty `plots` array, not an error.
- **AC-3**: The view sheet's Client Statement tab only appears when the contact is a `CLIENT` with at least one plot, matching the current behavior.
- **AC-4**: Switching the plot dropdown in the view sheet does not trigger a new network request; all plots' data was already loaded in the one `statement-data` fetch.
- **AC-5**: The endpoint excludes soft-deleted contacts (404), soft-deleted plots, and never includes a soft-deleted sales agent's row differently from an active one (a contract's sales agent is a historical fact, shown even if that contact was later soft deleted).

## Decision

**Chosen option**: fix in place. Change the sheet's `formContent` to pass `viewingRow` (not `editingRow`) and fetch `GET /api/contacts/:id/statement-data` keyed on `viewingRow.id`; declare a `ClientContact` type in a new `src/client/types/contacts.ts` matching the endpoint's real response exactly (`plots[].latestContract`, no `contracts[]` array and no separate `activeContract` field, since those are the shape this spec removes); replace the merge-two-contracts logic with the single latest-contract rule.

A full rewrite of the view sheet into its own route was considered in the design conversation and explicitly rejected: the sheet pattern already matches how Edit works, and the scope note's "dedicated view screen" is satisfied by a working sheet with its own form component, not necessarily a new page.

## Feature design

**Data model sketch**: no schema change; this is a read composed from `contacts`, `plots`, `projects`, `plotSaleContracts`, `payments`, `installments`, all of which already exist.

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| /api/contacts/:id/statement-data | GET | `id` (path) | `{ contact, plots: [{ ...plot, project, latestContract: { ...contract, payments: [...], installments: [...], salesAgent: { id, fullName, email } \| null } \| null }] }` | any authed org member | 404 if the contact does not exist or is soft deleted |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| statement-data response | which contract is "latest" per plot | `plots.activeContractId` if set (any status), else the `plotSaleContracts` row for that plot with the greatest `startDate`, tie broken by `createdAt` then `id`; every contract status is eligible for the fallback, including `COMPLETED`/`CANCELLED` (a fully paid off, no longer active contract must still be selectable, since the confirmation letter, 0004, needs exactly that case) |
| statement-data response | a plot with no contract yet | `latestContract: null`; the view sheet's dropdown still lists the plot, its tab content shows "no contract yet" instead of a table |
| statement-data response | `latestContract.salesAgent` | `plotSaleContracts.salesAgentContactId` joined to `contacts` (`fullName`, `email`); `null` when the contract has no sales agent, present even if that agent contact was later soft deleted (historical fact) |
| statement-data response | payments/installments ordering | payments sorted by `receivedAt` ascending; installments sorted by `installmentNo` ascending; both scoped to `latestContract.id` only (never a second contract's rows) |
| View sheet render | which contact/data the sheet shows | `viewingRow.id`, not `editingRow.id` (the bug this spec fixes) |

**Key invariants**:
- A plot's `latestContract` is always the single most relevant contract for that plot; the endpoint never returns more than one contract per plot, and never merges two contracts' payments/installments.
- Soft deleted rows (`contacts.isDeleted`, `plots.isDeleted`) are excluded from the response; a soft deleted contract's own `isDeleted`-equivalent (contracts have no such flag, only `status`) is not a factor for eligibility.

**Security model**: standard `clerkAuth()` → `tenantResolver()`, any authed org member (matches every other contacts/plots/contracts read today; this project has no per-record ownership model).

**Critical test scenarios**:
- Happy path: clicking "View" on a client with two plots opens the sheet showing that client, both plots listed in the dropdown, each with its latest contract's payments/installments, verifies **AC-1**, **AC-2**
- Failure case: a contact with zero plots returns `plots: []` from the endpoint and the sheet shows the Overview tab only, no error, verifies **AC-2**, **AC-3**
- Auth/permission: requesting `statement-data` for a contact id from another tenant's database is impossible since `tenantDb` is already scoped per request, verifies **AC-2**

## Build plan

1. Add `GET /api/contacts/:id/statement-data` to `src/worker/routes/contacts.ts` (registered so it does not collide with `/:id`), joining plots → project and plots → latest contract → payments/installments/sales agent, filtering soft deleted contacts/plots, satisfies **AC-2**, **AC-5**
2. Fix `contacts-datagrid.tsx` to pass `viewingRow` into `ViewContactForm` and fetch the new endpoint keyed on its `id`, owning the combined data load per the umbrella's cross child contract, satisfies **AC-1**
3. Declare the real `ClientContact` type in `src/client/types/contacts.ts` matching the endpoint response, replacing the currently undeclared one, satisfies **AC-2**
4. Replace `view-contact-form.tsx`'s merge-two-contracts logic with the single latest-contract selection already returned by the endpoint, satisfies **AC-2**, **AC-4**

## Consequences

**Positive**:
- The view sheet becomes trustworthy: it always shows the row that was clicked.
- One endpoint now serves both remaining documents (0003, 0004), so there is exactly one place that decides "which contract is the plot's current one."

**Negative / tradeoffs**:
- The endpoint always loads every plot's latest contract with its full payments/installments up front, which is more data than a plot the user never selects in the dropdown needs; acceptable given contacts here rarely hold more than a handful of plots.

**Neutral**:
- `GET /api/contacts/:id` (the flat record) is unchanged and keeps serving the edit form; this spec adds a second, richer endpoint rather than changing the existing one, so no existing caller is affected.

## Follow-up

None.
