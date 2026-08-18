# 0001. Finish the contacts feature: view sheet, statements, confirmation letters, bulk import

**Date**: 2026-08-18
**Status**: In Progress

## Summary

Contacts already lists, creates, and edits real data. This spec finishes the four pieces still missing: a working view sheet, a client payment statement PDF, a payment completion confirmation letter PDF, and a working CSV bulk import. All four share two building blocks: a small new company branding record per tenant, and one new endpoint that returns a contact together with its plots and contracts. This is an umbrella (five related but separately buildable decisions); each child spec below is complete enough to build on its own.

## Structure

- [0001-company-branding-settings.md](0001-company-branding-settings.md): where the company name, logo, slogan, colors, and contact details shown on generated documents come from. Supports every other child in this spec.
- [0002-contact-view-and-detail-data.md](0002-contact-view-and-detail-data.md): fixes the view sheet's wiring bug and adds the endpoint that returns a contact with its plots and latest contract. Supports 0003 and 0004.
- [0003-client-statement-pdf.md](0003-client-statement-pdf.md): finishes the client payment statement PDF and its download action.
- [0004-confirmation-letter-pdf.md](0004-confirmation-letter-pdf.md): a new PDF confirming a contract is fully paid off.
- [0005-contacts-csv-bulk-import.md](0005-contacts-csv-bulk-import.md): wires the already built CSV uploader UI to a real bulk-create endpoint.

## Cross child contract

Every child in this spec must honor these shared pieces, so the pieces stay consistent across all four documents and screens. (Added after an independent cross check of the first draft: the pieces below are now pinned to one exact shape each, closing gaps the draft left for each child to restate slightly differently.)

- **Branding data shape** (0001): every consumer (the statement, the confirmation letter, the view sheet) uses exactly one combined shape, built once and passed down, never re-fetched or re-shaped per document:
  ```
  {
    logoUrl: string | null,       // Clerk useOrganization(), organization.imageUrl
    companyName: string,          // Clerk useOrganization(), organization.name
    branding: {                   // GET /api/company-settings (0001)
      slogan: string | null,
      primaryColor: string | null,   // hex, e.g. "#1e3a5f"
      email: string | null,
      mobileNumber: string | null,
      address: string | null,
      website: string | null,
      signerTitle: string | null,
    }
  }
  ```
- **Who loads it**: `contacts-datagrid.tsx` (or a thin wrapper it renders) owns loading both `GET /api/contacts/:id/statement-data` (0002, keyed on `viewingRow.id`) and `GET /api/company-settings` (0001), plus reading `useOrganization()`, once per time the view sheet opens. It shows a loading skeleton while either is in flight, an inline error with retry if either fails, and only mounts the Client Statement / Confirmation Letter tab content once both have resolved (company settings degrade to the all null shape above rather than blocking, per 0001 AC-4). `ViewContactForm` receives the already assembled `{ contact, extra }`; it never fetches on its own.
- **Contact detail data** (0002): the statement (0003) and the confirmation letter (0004) both read from the same `GET /api/contacts/:id/statement-data` response, including its nested `latestContract.salesAgent`; neither adds its own endpoint, re-shapes the plot/contract data, or fetches the sales agent separately.
- **"Latest contract" rule**: everywhere a plot's contract is picked (the view sheet's plot dropdown, the statement, the confirmation letter), it is the plot's `activeContractId` contract if set (regardless of that contract's status), else the contract with the most recent `startDate` (tie break: most recent `createdAt`, then `id`) among all of that plot's contracts, any status. Never merge two contracts' payments/installments together (the current WIP code does this for the active + first contract; this spec replaces that logic).
- **"Fully paid" balance rule**: one shared computation used identically by 0003 (statement display) and 0004 (letter gate): `totalPaid = sum(payments where direction === "IN", amount as a number)`, `balance = Number(latestContract.totalContractValue) - totalPaid`. The statement displays `max(balance, 0)`; the confirmation letter is enabled only when `balance <= 0` and a `latestContract` exists.
- **Reference number format**: one shared function, not restated per document: `{orgInitials}/{projectName}/{clientInitials}/{yyyyMMdd}-{docType}` where `docType` is `STMT` for the statement and `CONF` for the confirmation letter. `orgInitials`/`clientInitials` are the uppercased first letters of up to the first 3 whitespace separated words; `projectName` has whitespace stripped and any character outside `A-Za-z0-9_-` removed (`"NA"` if empty); the date is the **local** date (`yyyyMMdd` built from `getFullYear()`/`getMonth()`/`getDate()`), not `toISOString()` (which is UTC and can show the wrong day in the evening in East Africa time). This keeps the two documents' numbers from colliding even when generated the same day for the same client.

## Requirements

This umbrella has no acceptance criteria of its own; each child's `## Requirements` carries its own acceptance criteria, and `/check verify` checks each child independently.

## Decision

**Chosen option**: fix the view sheet and finish the statement in place, add two new small features (confirmation letter, branding settings) alongside them, and wire the already built CSV importer to a real endpoint, all as one umbrella spec rather than five separate `/architect` runs, because they share the branding and contact detail data described above.

## Rationale

See [rationale.md](rationale.md).

## Build plan

Each child spec carries its own build plan. Build them in this order, since later children depend on earlier ones:

1. [0001-company-branding-settings.md](0001-company-branding-settings.md): the settings table, its endpoint, and the Clerk `OrganizationProfile` "Branding" page.
2. [0002-contact-view-and-detail-data.md](0002-contact-view-and-detail-data.md): the `statement-data` endpoint and the view sheet wiring fix, since 0003 and 0004 both consume it.
3. [0003-client-statement-pdf.md](0003-client-statement-pdf.md) and [0004-confirmation-letter-pdf.md](0004-confirmation-letter-pdf.md): can build in parallel once 0001 and 0002 are done, since neither depends on the other.
4. [0005-contacts-csv-bulk-import.md](0005-contacts-csv-bulk-import.md): independent of the other four, can build any time.

## Consequences

**Positive**:
- One consistent source of branding and contact/contract data across every document, instead of four independent, drifting implementations.
- The confirmation letter and the statement share the same `extra` branding prop and the same contact detail fetch, so a future third document (e.g. a receipt) has an established pattern to follow.

**Negative / tradeoffs**:
- Splitting into five child specs means five smaller reviews instead of one; `/develop` needs to read the umbrella structure to know the build order.
- The branding settings table and its Clerk custom page (0001) must ship before the statement or letter can render real company details; until then they fall back to blanks.

**Neutral**:
- The existing merged-two-contracts statement logic in `view-contact-form.tsx` is replaced by the single "latest contract" rule; no data is lost, only which contract's payments are shown when a plot has more than one.

## Follow-up

- [ ] The reference number scheme here is a same-day, human-readable string, not a sequential counter like the sample letter's `.../660`. If the business wants strictly sequential document numbers, that needs its own small `document_number` counter table, out of scope here.
- [ ] Once R2 tenant file wiring ships (tracked separately, see `SCAFFOLD_NOTES.md`), revisit whether the company logo should also support a direct upload rather than always going through Clerk's own organization image.
