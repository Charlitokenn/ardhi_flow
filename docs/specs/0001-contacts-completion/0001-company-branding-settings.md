# 0001. Company branding settings

## Summary

Generated documents (the client statement, the confirmation letter) need the company's name, logo, slogan, colors, and contact details. Name and logo already live in Clerk (the organization's own name and image); everything else gets one new small settings table per tenant, edited from a new "Branding" page inside Clerk's own organization profile screen.

## Context

No part of this project currently stores organization branding. The in progress statement code has a literal stub, `getCurrentTenantFromCatalog()`, returning nothing. Clerk already holds the organization's name and logo (`useOrganization()` on the client), since every org already sets those when creating the org in Clerk. The remaining fields (slogan, brand color, email, mobile, address, website, and the document signer's title, e.g. "Meneja Mkuu") have no home yet, in Clerk or in the database.

## Requirements

**User stories**:
- As an org admin, I want to set my company's branding details once so that every generated document uses them automatically.
- As any staff member, I want the statement and confirmation letter to show real company details, not placeholders.

**Acceptance criteria**:
- **AC-1**: An org admin can open a "Branding" page inside the existing Clerk organization profile screen and see the organization's name and logo (read only, sourced from Clerk) alongside editable fields for slogan, brand color, email, mobile number, address, website, and signer title.
- **AC-2**: Saving the form persists the editable fields via `PUT /api/company-settings` and they are returned by a subsequent `GET /api/company-settings`.
- **AC-3**: A non admin org member can read branding settings (`GET`) but cannot save changes (`PUT` returns 403).
- **AC-4**: Before any settings have been saved, `GET /api/company-settings` returns a row of `null` fields (not a 404), so callers can render blanks rather than handle a missing-resource error.

## Decision

**Chosen option**: one singleton `company_settings` row per tenant database, exposed via `GET`/`PUT /api/company-settings`, edited from a Clerk `<OrganizationProfile>` custom page ("Branding") that reads name/logo straight from Clerk and only writes the remaining fields to the new table.

Storing name and logo again in the new table was considered and rejected: Clerk is already the org's system of record for both (its own name field and organization image upload), so duplicating them would create two sources of truth that can silently disagree. Everything Clerk does not model (slogan, color, contact details, signer title) gets the new table.

## Feature design

**Data model sketch**:
- `company_settings` (tenant schema, singleton): `id` (uuid, pk, always the fixed constant `00000000-0000-0000-0000-000000000001`), `slogan` (text, nullable), `primaryColor` (text, nullable, hex e.g. `#1e3a5f`), `email` (text, nullable), `mobileNumber` (text, nullable), `address` (text, nullable), `website` (text, nullable), `signerTitle` (text, nullable, e.g. "Meneja Mkuu"), `createdAt`, `updatedAt`.
- Singleton enforced by the fixed `id`, not by "find the first row": `PUT` always does `INSERT ... VALUES (fixedId, ...) ON CONFLICT (id) DO UPDATE SET ...`, so two concurrent saves can never create two rows; the second write simply overwrites the first (last write wins, acceptable for a single settings form with no concurrent-edit UI). `GET` always reads by that same fixed `id`.
- `PUT` is a partial update: a field omitted from the request body leaves the stored value unchanged; a field sent as `null` or `""` clears it to `null`. No field is required on every `PUT`.
- `primaryColor`, when provided, must match `/^#[0-9A-Fa-f]{6}$/`; the endpoint rejects (422) any other value rather than storing a color that later breaks PDF rendering.

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| /api/company-settings | GET | none | `{ slogan, primaryColor, email, mobileNumber, address, website, signerTitle }`, every field `null` if never saved (no `id`, no 404) | any authed org member | none beyond standard auth failures |
| /api/company-settings | PUT | slogan?, primaryColor?, email?, mobileNumber?, address?, website?, signerTitle? (all optional; omitted = unchanged, `null`/`""` = cleared) | the updated row, same shape as GET | authed + `org:admin` role | 403 if `orgRole !== 'org:admin'`; 422 if `primaryColor` is not a valid 6 digit hex code |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Branding page load | organization name | Clerk `useOrganization()`, `organization.name` |
| Branding page load | organization logo | Clerk `useOrganization()`, `organization.imageUrl` |
| Branding page load | slogan, color, email, mobile, address, website, signer title | `GET /api/company-settings` |
| PUT /api/company-settings authorization | whether the caller may write | `c.get('orgRole')`, set by `clerkAuth()` from the `org_role` JWT claim (already available, see `clerk-auth.ts`) |

**Key invariants**:
- Exactly one `company_settings` row exists per tenant database at any time (enforced by the fixed `id` + `ON CONFLICT DO UPDATE`, not by "find the first row").
- Name and logo are never written to `company_settings`; they are always read live from Clerk.

**Security model**:
- Standard `clerkAuth()` → `tenantResolver()` chain, no bypass.
- `GET` open to any authed org member (every document generator needs to read it).
- `PUT` requires `org:admin` (checked server side via `orgRole`, matching the existing client side `isAdmin` check already used to gate opening the organization profile in `team-switcher.tsx`).

**Critical test scenarios**:
- Happy path: an admin fills in slogan, color, email, mobile, address, website, and signer title, saves, and reloading the Branding page shows the same values, verifies **AC-1**, **AC-2**
- Failure case: a non admin org member calls `PUT /api/company-settings` directly and receives a 403, verifies **AC-3**
- Auth/permission: a brand new tenant with no settings row yet calls `GET /api/company-settings` and receives nulls, not a 404, verifies **AC-4**

## Build plan

1. Add the `companySettings` table to `drizzle/tenant/schema.ts` and generate its migration, satisfies **AC-2**
2. Run the existing tenant migration fan-out job (`scripts/migrate-tenants.ts` / `migrate-tenants-pg.ts`) against already-provisioned tenants so this table exists everywhere before the endpoint ships, and include the migration in the provisioning pipeline's schema apply step for new tenants, satisfies **AC-2**, **AC-4**
3. Build `GET`/`PUT /api/company-settings` in a new `src/worker/routes/company-settings.ts`, chained into the authed routes the same way `contacts.ts` is; `PUT` upserts by the fixed id and checks `orgRole === 'org:admin'`, satisfies **AC-2**, **AC-3**, **AC-4**
4. Build the "Branding" form component (`src/client/components/forms/company/branding-settings-form.tsx`) and mount it as a custom page (label "Branding", path `branding`) inside `<OrganizationProfile>` via its custom pages API (passed either directly to a mounted `<OrganizationProfile>` or into `openOrganizationProfile({ customPages: [...] })` in `team-switcher.tsx`, where `isAdmin` is already computed), pre-filling name/logo from `useOrganization()` and the rest from `GET /api/company-settings`, wired to `PUT` on save, satisfies **AC-1**, **AC-2**

## Consequences

**Positive**:
- No duplicated name/logo data to keep in sync with Clerk.
- Reused inside Clerk's own organization profile screen, so no new navigation entry or route is needed.

**Negative / tradeoffs**:
- Branding is entirely unset until an admin visits the new Branding page at least once; every document falls back to blanks until then.
- Logo is entirely dependent on Clerk's organization image upload; there is no path to a custom, non Clerk hosted logo without waiting for R2 tenant file wiring (a separately tracked, not yet built, hardening item).

**Neutral**:
- `company_settings` intentionally has no `isDeleted` flag or history; it is a single editable row, not a list.

## Follow-up

- [ ] If R2 tenant file wiring ships later, revisit whether a custom logo upload (bypassing Clerk's org image) is worth adding.
