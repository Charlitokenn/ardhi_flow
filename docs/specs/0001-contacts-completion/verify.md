# Verify: contacts · spec 0001 · updated 2026-10-27
_Steps derived from spec 0001 acceptance criteria (children 0001 to 0005). `/check verify` runs these; `/test` locks the durable ones._

Setup: sign in as an `org:admin` of a provisioned tenant with seeded data (`scripts/seed-tenant.ts`). Some steps need a second user with the plain `org:member` role.

## UI / manual

### 0001 Company branding settings
- [x] Click the org name in the sidebar → Settings → Branding tab → the org name and logo show at the top (read only, from Clerk), plus editable slogan, brand color, email, mobile, address, website, signer title → 0001 AC-1
- [x] Change slogan, website, and signer title → Save Branding → toast "Save Successful", and the sidebar slogan updates without a reload → 0001 AC-2
- [x] Signed in as an `org:member`, the sidebar org button shows "Only admins can manage organization settings" → 0001 AC-3
- [x] On a small screen (about 375 by 667), open Settings → Branding tab → scroll to the bottom → the Save Branding button is reachable, not clipped by the dialog's `overflow-hidden` → 0001 AC-1, AC-2

### 0002 Contact view sheet
- [x] Row menu → Edit on contact A, close it, then row menu → View on contact B → the sheet shows B only → 0002 AC-1
- [x] View a `CLIENT` with plots → tabs include Client Statement and Confirmation Letter; view a client with no plots, and a sales agent → neither tab appears → 0002 AC-3
- [x] In the statement tab, switch the plot dropdown → no new `/api` request in the network panel → 0002 AC-4

### 0003 Client statement PDF
- [x] Open Client Statement → "Afisa Mauzo" shows the selected plot's latest contract sales agent → 0003 AC-1
- [ ] A contract with no sales agent shows "—" for the agent → 0003 AC-1
- [x] Header shows the Clerk org name, logo, and saved slogan; footer shows saved email, mobile, address, website; section bars use the saved brand color (`#1e3a5f` when none is saved) → 0003 AC-2
- [x] Clear all branding fields and reopen → blanks, no placeholder text → 0003 AC-2
- [x] Download Statement → browser saves `statement-{client-slug}-{reference}.pdf` → 0003 AC-3
- [x] Reference reads `{orgInitials}/{project}/{clientInitials}/{yyyyMMdd}-STMT` with today's local date → 0003 AC-4
- [x] Switch plots → the statement re-renders for the new plot (new reference, agent, totals), with no network request → 0003 AC-5
- [x] Each installment row's last column equals allocated value minus the cumulative amount paid up to that row; unpaid rows repeat the previous balance → 0003 AC-6

### 0004 Confirmation letter PDF
- [x] Select a plot whose latest contract is not fully paid → tab shows "Available when the selected contract balance is fully paid." and no download; select a fully paid plot → letter renders with Download Letter → 0004 AC-1
- [x] Letter text matches the sample in the spec word for word, with the plot number, size, project street/ward/district/region, project name, client name, and today's Swahili date filled in → 0004 AC-2
- [x] Header shows the org name and logo; signature block shows the company name, a dotted line, and the saved signer title → 0004 AC-3
- [x] Download Letter → browser saves `confirmation-{client-slug}-{reference}.pdf` → 0004 AC-4
- [x] The letter reference ends `-CONF` and differs from the same day statement reference (`-STMT`) for the same client → 0004 AC-5

### 0005 CSV bulk import
- [x] Upload a CSV with valid rows, one row whose mobile matches an existing contact in a different format, one row repeating an earlier row's mobile, one row with a blank mobile, and one with an invalid contact type → results panel shows the counts (created / skipped / failed) and a reason per non created row → 0005 AC-1, AC-2, AC-3, AC-4, AC-6
- [x] The blank mobile row fails on its own; the rest of the file still imports → 0005 AC-4
- [x] Close the uploader → the new contacts appear in the grid without a reload → 0005 AC-5

## Commands
- [ ] `GET /api/company-settings` on a tenant with no saved row → 200 with all seven fields `null` → 0001 AC-4
- [x] `PUT /api/company-settings` as `org:admin` → 200, and a following `GET` returns the saved values → 0001 AC-2
- [x] `PUT /api/company-settings` as `org:member` → 403 → 0001 AC-3
- [x] `GET /api/contacts/:id/statement-data` for every contact → 200; each plot has `project` and `latestContract` with `payments`, `installments`, `allocatedValue`, `salesAgent`; a contact with no plots → `plots: []` → 0002 AC-2
- [x] Plot with an `activeContractId` plus a newer cancelled contract → `latestContract` is the active one; plot with no active contract → newest by `startDate` (any status) → 0002 AC-2
- [ ] Soft deleted contact → 404; soft deleted plot → missing from `plots`; soft deleted sales agent → still present on the contract with `isDeleted: true` → 0002 AC-5
- [x] `POST /api/contacts/bulk` with rows missing, `null`, or `""` for `fullName`/`mobileNumber`, or missing/`null` `contactType` → each reported `failed` with a per field reason; valid rows still created → 0005 AC-4
- [x] `npx tsc -b`, `npx eslint <changed files>`, `npx vite build` in `apps/web` → all pass → project gate

## Value sourcing (from spec 0001 Feature design)
- [ ] Org name and logo: rename the org or change its image in Clerk (General) → Branding tab, statement, and letter all show the new values without saving anything → 0001 AC-1, 0003 AC-2
- [x] Reference date: generate a document between 00:00 and 03:00 East Africa time → reference uses the local date, not the previous UTC day → 0003 AC-4

## Acceptance-criteria coverage
- 0001: AC-1 UI · AC-2 UI + command · AC-3 UI + command (needs `org:member`) · AC-4 command
- 0002: AC-1 UI · AC-2 commands · AC-3 UI · AC-4 UI · AC-5 command
- 0003: AC-1 to AC-6 UI · AC-4 also value sourcing
- 0004: AC-1 to AC-5 UI
- 0005: AC-1 to AC-6 UI · AC-4 also command
