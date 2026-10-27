# 0001. Company branding settings

## Summary

Generated documents (the client statement, the confirmation letter) need the company's name, logo, slogan, colors, and contact details. Name and logo already live in Clerk (the organization's own name and image); everything else gets one new small settings table per tenant. Admins edit it from a "Branding" tab on a single "Settings" page inside Clerk's own organization profile screen. Settings is one Clerk page that holds tabs, so later tenant settings can be added as more tabs instead of more Clerk pages.

## Context

No part of this project currently stores organization branding. The in progress statement code has a literal stub, `getCurrentTenantFromCatalog()`, returning nothing. Clerk already holds the organization's name and logo (`useOrganization()` on the client), since every org already sets those when creating the org in Clerk. The remaining fields (slogan, brand color, email, mobile, address, website, and the document signer's title, e.g. "Meneja Mkuu") have no home yet, in Clerk or in the database.

## Requirements

**User stories**:
- As an org admin, I want to set my company's branding details once so that every generated document uses them automatically.
- As any staff member, I want the statement and confirmation letter to show real company details, not placeholders.

**Acceptance criteria**:
- **AC-1**: An org admin can open the "Settings" page inside the existing Clerk organization profile screen, land on its "Branding" tab (the default tab), and see the organization's name and logo (read only, sourced from Clerk) alongside editable fields for slogan, brand color, email, mobile number, address, website, and signer title.
- **AC-2**: Saving the form persists the editable fields via `PUT /api/company-settings` and they are returned by a subsequent `GET /api/company-settings`.
- **AC-3**: A non admin org member can read branding settings (`GET`) but cannot save changes (`PUT` returns 403).
- **AC-4**: Before any settings have been saved, `GET /api/company-settings` returns a row of `null` fields (not a 404), so callers can render blanks rather than handle a missing-resource error.

## Decision

**Chosen option**: one singleton `company_settings` row per tenant database, exposed via `GET`/`PUT /api/company-settings`, edited from a "Branding" tab on one Clerk `<OrganizationProfile>` custom page ("Settings"). The tab reads name/logo straight from Clerk and only writes the remaining fields to the new table. Name and logo are edited on Clerk's built in General page of the same profile screen (the Branding tab says so); this spec accepts that dependency, so hiding or removing General would leave no place to edit them.

**Placement (updated 2026-10-27, matches the shipped code)**: the first draft gave Branding its own Clerk custom page. The build instead adds one custom page, "Settings", which holds a row of horizontal tabs, with Branding as the first tab. The reason is room for more settings: future tenant settings (for example document defaults, or message template settings if they ever need an admin screen) get added as new tabs on the same page, so Clerk's profile sidebar keeps a single custom entry next to Clerk's own General and Members pages. The alternative, one Clerk custom page per settings area, needs no tab component and lets each area have its own hash URL, but it lengthens Clerk's sidebar with every new area and mixes our pages in among Clerk's.

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
| /api/company-settings | PUT | slogan?, primaryColor?, email?, mobileNumber?, address?, website?, signerTitle? (all optional; omitted = unchanged, `null`/`""` = cleared) | the updated row, same shape as GET | authed + `org:admin` role | 400 if the body has the wrong types (Zod validator default); 403 if `orgRole !== 'org:admin'`; 422 if `primaryColor` is not a valid 6 digit hex code. The form shows the server `error` text in a failure toast |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Settings page open | which tab shows first | `defaultValue="branding"` in `organization-settings.tsx` (tab state is local React state, not the URL) |
| Branding tab load | organization name | Clerk `useOrganization()`, `organization.name` |
| Branding tab load | organization logo | Clerk `useOrganization()`, `organization.imageUrl` |
| Branding tab load | slogan, color, email, mobile, address, website, signer title | `GET /api/company-settings` |
| PUT /api/company-settings authorization | whether the caller may write | `c.get('orgRole')`, set by `clerkAuth()` from the `org_role` JWT claim (already available, see `clerk-auth.ts`) |

**Key invariants**:
- Exactly one `company_settings` row exists per tenant database at any time (enforced by the fixed `id` + `ON CONFLICT DO UPDATE`, not by "find the first row").
- Name and logo are never written to `company_settings`; they are always read live from Clerk.
- Exactly one of our custom pages lives in `<OrganizationProfile>`: "Settings" (`url="settings"`). A new tenant settings area is added as one more entry in `settingsTabData` in `organization-settings.tsx`, never as a new `<OrganizationProfile.Page>`.
- Branding stays the first entry in `settingsTabData`, and `organization-settings.tsx` always passes `defaultValue="branding"` explicitly, so the default tab never depends on `ReusableHorizontalTabs` falling back to the first tab.

**Security model**:
- Standard `clerkAuth()` → `tenantResolver()` chain, no bypass.
- `GET` open to any authed org member (every document generator needs to read it).
- `PUT` requires `org:admin` (checked server side via `orgRole`, matching the existing client side `isAdmin` check already used to gate opening the organization profile in `team-switcher.tsx`). The client gate covers the whole Settings page and every tab on it: a non admin clicking the sidebar org button gets the "Only admins can manage organization settings" toast and the dialog never opens. The client gate is a convenience only; the server side `orgRole` check is the real control, and any future tab that writes data needs its own server side check too.

**Critical test scenarios**:
- Happy path: an admin fills in slogan, color, email, mobile, address, website, and signer title, saves, closes the dialog, reopens Settings, and the Branding tab shows the same values (a browser reload closes the dialog, since its `open` state is local, so reopening is the real check), verifies **AC-1**, **AC-2**
- Failure case: a non admin org member calls `PUT /api/company-settings` directly and receives a 403, verifies **AC-3**
- Auth/permission: a brand new tenant with no settings row yet calls `GET /api/company-settings` and receives nulls, not a 404, verifies **AC-4**

## Build plan

1. Add the `companySettings` table to `drizzle/tenant/schema.ts` and generate its migration, satisfies **AC-2**
2. Run the existing tenant migration fan-out job (`scripts/migrate-tenants.ts` / `migrate-tenants-pg.ts`) against already-provisioned tenants so this table exists everywhere before the endpoint ships, and include the migration in the provisioning pipeline's schema apply step for new tenants, satisfies **AC-2**, **AC-4**
3. Build `GET`/`PUT /api/company-settings` in a new `src/worker/routes/company-settings.ts`, chained into the authed routes the same way `contacts.ts` is; `PUT` upserts by the fixed id and checks `orgRole === 'org:admin'`, satisfies **AC-2**, **AC-3**, **AC-4**
4. Build the "Branding" form component (`src/client/components/forms/company/branding-settings-form.tsx`), showing name/logo read only from `useOrganization()` and the rest from `GET /api/company-settings`, wired to `PUT` on save (invalidating the `["company-settings"]` query key so the sidebar slogan refreshes), satisfies **AC-1**, **AC-2**
5. Build the Settings page container (`src/client/components/organization-settings.tsx`): a "Settings" heading over `ReusableHorizontalTabs`, with a `settingsTabData` list whose first and default entry is the Branding tab (`value: "branding"`) rendering `BrandingSettingsForm`. Mount it in `team-switcher.tsx` as `<OrganizationProfile.Page label="Settings" url="settings">` inside the dialog hosted `<OrganizationProfile routing="hash">`, which only opens when `isAdmin` is true, satisfies **AC-1**, **AC-3**

## Consequences

**Positive**:
- No duplicated name/logo data to keep in sync with Clerk.
- Reused inside Clerk's own organization profile screen, so no new navigation entry or route is needed.
- New tenant settings areas cost one tab entry, not a new Clerk page, so the profile sidebar stays short.

**Negative / tradeoffs**:
- The selected tab is not in the URL (Clerk hash routing stops at `#/settings`), so you cannot link straight to a tab other than Branding. Fine with one tab; worth revisiting once there are several.
- Unsaved edits are lost when you leave the Branding tab: the tabs unmount inactive content (Radix default) and the form seeds its state on mount, and moving to Clerk's General or Members page unmounts Settings too. Accepted while Branding is the only tab; add `forceMount` or an unsaved changes guard when a second tab lands.
- One Settings page with many tabs can grow crowded; past roughly five or six tabs, splitting into a second Clerk page or a real app route becomes the better shape.
- Branding is entirely unset until an admin saves the Branding tab on the Settings page at least once; every document falls back to blanks until then.
- Logo is entirely dependent on Clerk's organization image upload; there is no path to a custom, non Clerk hosted logo without waiting for R2 tenant file wiring (a separately tracked, not yet built, hardening item).

**Neutral**:
- `company_settings` intentionally has no `isDeleted` flag or history; it is a single editable row, not a list.

## Follow-up

- [ ] If R2 tenant file wiring ships later, revisit whether a custom logo upload (bypassing Clerk's org image) is worth adding.
- [ ] The header comment at `branding-settings-form.tsx:51` still says it is "Mounted into a custom 'Branding' page"; it is now a tab on the Settings page (`organization-settings.tsx`). The comment at `team-switcher.tsx:21` ("edited in the Branding page below") has the same issue. One line comment fixes for `/develop`.
- [ ] `PUT /api/company-settings` validates only `primaryColor`. Email, mobile, and website have no server side format check, and slogan, address, and signer title have no length cap, so a direct `PUT` can store values that later break or overflow the PDFs. Add basic email, E.164 mobile, URL checks and length caps.
- [ ] The client admin gate in `team-switcher.tsx` reads `has?.({role: 'org:admin'})` without waiting for Clerk's `isLoaded`, so a real admin clicking during load can get the "Unauthorized" toast. Wait for `isLoaded` before deciding.
- [x] The contacts scope row now reads "Branding tab on the Clerk Settings custom page" (updated 2026-10-27).
