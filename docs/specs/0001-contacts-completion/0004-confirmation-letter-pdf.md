# 0004. Confirmation letter PDF

## Summary

A new PDF confirming to a client, in writing, that they have finished paying for their plot. Modeled on a real sample letter the business already uses, it reuses the same branding and contact/contract data as the statement (0001, 0002), and is only available once the selected contract's balance is fully paid.

## Context

The "Confirmation Letter" button next to Client Statement has no document behind it. The business already has a real template for this (a sample letter reviewed during design): a reference number, a recipient block (name, location, date), a bolded subject line naming the project, a body confirming the client has finished paying for a specific plot (plot number, size, location, project, purchased through the company), a thank you paragraph, company contact details, and a signature block with a signer title (e.g. "Meneja Mkuu").

**Sample letter text** (the real wording to build from, Swahili, with the variable parts marked; keep this wording rather than inventing new copy):

> KWA,
> {clientFullName},
> {region in caps}, {date}
>
> **REF: UTHIBITISHO WA KUMALIZA MALIPO YA UNUNUZI WA KIWANJA KILICHOPO MRADI WA {projectName}**
>
> Ndugu {clientFullName},
>
> Rejea kichwa cha habari hapo juu. Barua hii ni kuthibitisha kwamba umefanya manunuzi ya kiwanja Na. {plotNumber}, chenye ukubwa wa mita za mraba {plotSize}, kilichopo Mtaa wa {street}, kata ya {ward}, wilaya ya {district}, mkoa wa {region}, kupitia {companyName} na malipo ya kiwanja yamekamilika na huna deni tena na {companyName}.
>
> Tunashukuru kwa kuwa mteja mwaminifu na tunakutakia mafanikio mema katika kujenga taifa. Karibu sana {companyName}. Kwa mawasiliano zaidi usisite kuwasiliana nasi unapokuwa na uhitaji wa huduma zetu.
>
> Namba za simu: {mobileNumber}
> Barua Pepe: {email}
>
> Wako,
> {companyName},
> ..................................
> {signerTitle}

The reference number line at the very top of the sample (`VICL/Kigamboni Buyuni 2/MAR/2022/660`) is a different, sequential numbering scheme the business used by hand; this spec uses the umbrella's own reference number format instead (see Follow-up in index.md about sequential numbering).

## Requirements

**User stories**:
- As a staff member, I want to generate a signed-style letter confirming a client has fully paid off their plot, so I can hand them formal written proof.

**Acceptance criteria**:
- **AC-1**: The "Confirmation Letter" tab/action is disabled (with an explanatory label, "Available when the selected contract balance is fully paid.") unless the selected plot's latest contract has a balance of zero or less (using the umbrella's shared balance formula); enabled once fully paid. It only appears at all under the same visibility rule as the Client Statement tab: the contact is `CLIENT` and has at least one plot (0002 AC-3).
- **AC-2**: The generated letter follows the sample letter text above verbatim except for the variable placeholders, filled from: `plotNumber`/`plotSize` (the plot), `street`/`ward`/`district`/`region` (the plot's `project`, not the plot itself, since plots do not carry their own address fields), `projectName` (the project), `clientFullName` (the contact), and today's local date.
- **AC-3**: The letter's header/footer show the same company branding as the statement (0001, the umbrella's combined `extra` shape), and its signature block shows the company name and the configured signer title (`extra.branding.signerTitle`), with a blank signature line, matching the sample's closing block.
- **AC-4**: A "Download" action produces a real PDF file, named `confirmation-{clientSlug}-{referenceNumber}.pdf` (same slug rule as the statement, 0003 AC-3).
- **AC-5**: The reference number follows the umbrella's shared function ending in `-CONF`, distinct from the statement's `-STMT` number even when generated the same day for the same client.

## Decision

**Chosen option**: a new `ConfirmationLetterDocument` component (parallel to `ClientStatementDocument`, same `@react-pdf/renderer` approach) rendered as a third vertical tab ("Confirmation Letter", next to Overview and Client Statement) in the view sheet, fed by the same 0001/0002 data, with the same client side `PDFDownloadLink` pattern as the statement (0003). A third tab was chosen over reusing the existing dead button on the Statement tab because it matches the sheet's existing Overview/Statement tab pattern, keeps the two documents' toolbars (plot selector, Download) independent, and makes the disabled-until-paid state a property of the whole tab rather than a button awkwardly living inside the statement's own layout.

A shared single "document" component parameterized by document type (statement vs letter) was considered and rejected: the two documents have different structure (a payment table vs a prose letter body), so forcing one component to branch internally would be harder to read than two small, separate documents that both consume the same data props.

## Feature design

**Data model sketch**: no new schema; consumes 0002's `statement-data` response (contact, plot, project, latest contract, payments) and 0001's `company-settings` response. No confirmation-letter-specific table; "has this letter been generated before" is not tracked (see Follow-up).

**API surface**: no new endpoints; reads the same `GET /api/contacts/:id/statement-data` (0002) and `GET /api/company-settings` (0001) as the statement.

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Letter render | plot number, size | the selected plot, from 0002's response |
| Letter render | street, ward, district, region | the selected plot's `project` (0002's response); plots have no address fields of their own |
| Letter render | "fully paid" gate | the umbrella's shared balance formula, `balance <= 0` |
| Letter render | recipient name, today's date | contact's `fullName`; the client's current local date |
| Letter render | company name, logo, contact footer, signer title | the umbrella's combined `extra` object, identical to the statement, not fetched independently |
| Letter render | reference number | the umbrella's shared reference number function, `docType = "CONF"` |

**Key invariants**: the letter can only be generated (the action is enabled) when the gating balance check passes; the UI must re-evaluate this per plot selection, not just once when the sheet opens.

**Security model**: no change; generated client side from data the view sheet already has (standard authed org member read), same as the statement.

**Critical test scenarios**:
- Happy path: a fully paid contract shows the enabled Confirmation Letter action, generating a letter with the correct plot, project, and branding details, and a working Download, verifies **AC-1**, **AC-2**, **AC-3**, **AC-4**
- Failure case: a contract with a remaining balance shows the action disabled with an explanatory label, verifies **AC-1**
- Auth/permission: not applicable beyond the standard authed read already covering the underlying data (0001, 0002)

## Build plan

1. Build `confirmation-letter.tsx`, a new `@react-pdf/renderer` document rendering the sample letter text verbatim (Context) with its placeholders filled per the value sourcing table, satisfies **AC-2**, **AC-3**
2. Add a third "Confirmation Letter" vertical tab in `view-contact-form.tsx`, visible under the same `CLIENT`+has-plots rule as Client Statement, its content disabled/showing the explanatory label unless the selected plot's latest contract balance is zero or less, satisfies **AC-1**
3. Wire the umbrella's combined `extra` object (0001) and 0002's `statement-data` response into this document, satisfies **AC-2**, **AC-3**
4. Compute the `-CONF` reference number via the umbrella's shared function and add a "Download" action via `PDFDownloadLink` with the AC-4 filename, satisfies **AC-4**, **AC-5**

## Consequences

**Positive**: staff get a formal, branded confirmation letter without leaving the contact view sheet, reusing 100% of the statement's data plumbing.

**Negative / tradeoffs**: the letter's exact wording is modeled on one sample in Swahili; if the business needs a second language or a materially different template later, that is a new decision, not covered here.

**Neutral**: no record of "a confirmation letter was generated for this contract" is kept (see Follow-up); regenerating it is always possible as long as the contract stays fully paid.

## Follow-up

- [ ] Consider recording when a confirmation letter was generated (e.g. a `confirmationLetterSentAt` column on the contract) if the business later wants an audit trail of which clients have received one; not required for v1.
