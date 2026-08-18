# 0003. Client statement PDF

## Summary

Finishes the client payment statement: real branding, a real sales agent and account rep, the single latest-contract rule instead of merged contracts, and a working download button, on top of the `ClientStatementDocument` PDF layout that already exists.

## Context

`client-statement.tsx` is a complete `@react-pdf/renderer` layout already, rendered live in `view-contact-form.tsx` inside a `<PDFViewer>`. What is missing is real data feeding it: `billTo.salesAgent` is hardcoded to `"John doe"`, `statementDetails.accountRep`/`accountRepEmail` are blank strings, `companyName`/`logoUrl`/the footer branding fields all come from the still-unbuilt branding source (0001), and the payments/installments come from the merge-two-contracts logic this umbrella replaces (0002). There is also no way to actually download the generated file; today it only renders inside the page.

## Requirements

**User stories**:
- As a staff member, I want to generate a client's payment statement showing their plot, contract terms, and full payment/installment history, so I can hand it to the client or file it.
- As a staff member, I want to download the statement as a PDF file, not just preview it on screen.

**Acceptance criteria**:
- **AC-1**: Opening the Client Statement tab for a client with plots renders the statement using that plot's latest contract (0002), with `billTo.salesAgent` and `statementDetails.accountRep`/`accountRepEmail` all populated from that contract's `latestContract.salesAgent` (0002); in v1 the account rep is defined as the same person as the sales agent, not a separate role. Shows "—" when `salesAgent` is null.
- **AC-2**: The statement's header and footer show the real company name and logo (from Clerk) and slogan/color/email/mobile/address/website (from `GET /api/company-settings`, 0001), using the umbrella's single combined `extra` shape, falling back to blank fields (not placeholder text) when settings are unset. The header/table styling actually uses `extra.branding.primaryColor` (falling back to `#1e3a5f` when null), computed per render, not baked in at module load from the old stub.
- **AC-3**: A "Download" action generates the same document as a real PDF file the browser saves, named `statement-{clientSlug}-{referenceNumber}.pdf` (slug = the client's name lowercased, non alphanumeric characters replaced with `-`).
- **AC-4**: The reference number follows the umbrella's shared format and function ending in `-STMT`, using the local date, not UTC.
- **AC-5**: Switching the plot dropdown re-renders the statement for the newly selected plot without a network request (data already loaded per 0002).
- **AC-6**: Each installment row's running total is the contract's remaining balance after that installment's `amountPaid` is applied (`totalContractValue` minus the cumulative `amountPaid` of that row and every prior row, in `installmentNo` order), computed client side since `contract_installments` has no such column.

## Decision

**Chosen option**: fix in place. Keep the existing `ClientStatementDocument` layout; replace its data sources (branding, sales agent/account rep, contract selection) with the ones decided in 0001 and 0002, and add a download action using `@react-pdf/renderer`'s own `PDFDownloadLink` (already imported in this file's dependency, no new library).

Rebuilding the statement's PDF layout from scratch was considered and rejected: the existing layout is already complete and matches the sample document style; only its data sources need fixing.

## Feature design

**Data model sketch**: no new schema; consumes 0002's `statement-data` response and 0001's `company-settings` response.

**API surface**: no new endpoints; reads `GET /api/contacts/:id/statement-data` (0002) and `GET /api/company-settings` (0001).

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Statement render | `billTo.salesAgent`, `statementDetails.accountRep`/`accountRepEmail` | `latestContract.salesAgent.fullName`/`.email` from the 0002 endpoint response; `"—"` when null |
| Statement render | `companyName`, `logoUrl`, branding fields | the umbrella's combined `extra` object (index.md), not fetched independently by this component |
| Statement render | plot size, price/m², monthly installment, duration | computed client side from the plot/contract fields already in 0002's response, same formulas as the current WIP `view-contact-form.tsx` (surveyed size falling back to unsurveyed; total contract value / size; the existing flat-rate/downpayment installment formula; `termMonths`) |
| Statement render | each installment row's running total | `totalContractValue - cumulative amountPaid up to and including this row`, in `installmentNo` order (AC-6); computed client side, not stored |
| Statement render | reference number | the umbrella's shared reference number function, `docType = "STMT"` |
| Statement render | `currentBalance` shown to the user | `max(balance, 0)` using the umbrella's shared balance formula |
| Download action | the downloadable file | `PDFDownloadLink` wrapping the same `ClientStatementDocument` already rendered in the `PDFViewer`, no server involvement; `fileName` per AC-3 |

**Key invariants**: the statement always reflects exactly one contract per plot (the latest one, per 0002); it never sums payments across two contracts; its displayed balance and the confirmation letter's paid-off gate (0004) always agree, since both read the same shared balance formula.

**Security model**: no change; the statement is generated entirely client side from data the view sheet already has access to (standard authed org member read).

**Critical test scenarios**:
- Happy path: opening Client Statement for a client with a fully wired plot shows the real company branding (with the configured brand color actually applied), the contract's real sales agent, correct running totals per installment row, and a working Download button that saves a correctly named PDF, verifies **AC-1**, **AC-2**, **AC-3**, **AC-6**
- Failure case: a contract with no `salesAgent` set shows "—" instead of a blank or crash, verifies **AC-1**
- Auth/permission: not applicable beyond the standard authed read already covering the underlying data (0001, 0002)

## Build plan

1. Accept the umbrella's combined `extra` object as a prop (built by `contacts-datagrid.tsx`/0002) instead of calling `getCurrentTenantFromCatalog()`, and make the header/table `StyleSheet` build from `extra.branding.primaryColor` per render, satisfies **AC-2**
2. Wire `billTo.salesAgent`/`accountRep`/`accountRepEmail` to `latestContract.salesAgent` from 0002's response, satisfies **AC-1**
3. Compute the installment running-total column client side per AC-6, satisfies **AC-6**
4. Switch the reference number computation to the umbrella's shared function with `docType = "STMT"` and a local (not UTC) date, satisfies **AC-4**
5. Add a "Download" button using `PDFDownloadLink` around `ClientStatementDocument`, with the `fileName` convention from AC-3, satisfies **AC-3**
6. Confirm the dropdown-driven re-render still works against 0002's already-loaded data with no new fetch, satisfies **AC-5**

## Consequences

**Positive**: the statement becomes fully real end to end: real branding, real people, real single-contract data, and an actual downloadable file.

**Negative / tradeoffs**: none beyond what 0001 and 0002 already carry (blank branding until settings are set; heavier up front fetch).

**Neutral**: the PDF layout itself (colors, table columns, Swahili labels) is unchanged from the existing `client-statement.tsx`.

## Follow-up

None beyond the umbrella's.
