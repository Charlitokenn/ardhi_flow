# ArdhiFlow — Progress Tracker

Last updated: 2026-08-17 (contacts edit-form data-seeding removal)

> Status reflects what's actually in the codebase as of this generation (verified by
> reading route/component files and their data wiring), not the route/nav existing
> alone — a route with a `PageHero` and nothing else is `[~]`, not `[x]`.

---

## Phase 1 — Foundation

| Status | # | Feature | Notes |
|--------|---|---------|-------|
| [x] | 1 | Multi-tenant provisioning pipeline | Webhook → Queue → Neon create → migrate → catalog write, with idempotency guard. Compiles and builds; **never run against live Neon/Clerk/Cloudflare infrastructure** per `SCAFFOLD_NOTES.md` — treat as unverified end-to-end until it has been. |
| [x] | 2 | Auth + tenant-scoped API middleware | `clerkAuth()` + `tenantResolver()` chain built and used on every authed route. `CLERK_JWT_KEY` networkless verification confirmed against current Clerk docs. |
| [x] | 3 | App shell + routing | Full route tree, sidebar shell, mobile slide-over, Clerk-themed auth screens all present and building. |

## Phase 2 — Core Features

| Status | # | Feature | Notes |
|--------|---|---------|-------|
| [~] | 4 | Contacts | List page + `ContactsDataGrid` wired to real `useQuery`/API data. **Create and edit are now implemented and wired**, via `add-edit-contact-form.tsx` (728 lines, multi-step: contact info → address → next-of-kin), reachable from both the page-level "New Contact" action and the grid's row-level "Edit" action. The edit form no longer fetches/seeds a partial record itself — the grid passes its already-loaded full row (`IContact` now extends `ContactRecord`) as `initialData` so the form has everything on open. Remaining gap: "View" still renders inline in the grid rather than through `view-contact-form.tsx` (still an empty stub), and `client-statement.tsx` (client statement generation) is still an empty stub — `pdf.svg`/`users.svg` assets were added but aren't referenced by any code yet, suggesting this is queued next. |
| [x] | 5 | Projects & Plots | `ProjectsDataGrid` (666 lines) and the plots page (per `SCAFFOLD_NOTES.md`, a full list+create example against the real API) both wired to live data. |
| [~] | 6 | Sales / Plot Sale Contracts | Schema + worker route (`contracts.ts`) fully built, including the DB-level "one active contract per plot" constraint. `ContractsDataGrid` (701 lines) wired to real data. **Confirmed: contract *creation* is not wired in the UI** — the Sales page's "New Contract" button opens an empty sheet with no `sheetContent` passed in, even though the worker's `POST /contracts` endpoint (multi-step: pick plot, client, terms, generate installment schedule) is fully built. |
| [~] | 7 | Payments & Reconciliation | Transactions: `TransactionsDataGrid` (866 lines) wired to real data, route has a "Record Transaction" CTA. Reconciliation: route is a bare `PageHero` shell with a "New Reconciliation" button that isn't wired to anything yet — no reconciliation UI exists beyond the page header. |

## Phase 3 — Enhancement

| Status | # | Feature | Notes |
|--------|---|---------|-------|
| [ ] | 8  | Commission tracking | Schema (`commission_settings`, `commission_payouts`) and relations fully built. No dedicated UI surface found yet (not on the sidebar nav, no dedicated route) — likely surfaces inside the contract detail view once that exists, or needs its own page. |
| [ ] | 9  | Expenses | Schema fully built (`expenses` table, category enum, links to accounts/payees/projects/commission payouts) and a worker route (`expenses.ts`) exists. No dedicated client route/UI found in the current nav — confirm before building, since the worker side is already there. |
| [ ] | 10 | SMS messaging (NextSMS) | Schema (`sms_campaigns`, `sms_messages`, `sms_delivery_events`) fully built. `messaging/index.tsx` is a bare `PageHero` shell — no grid, no send flow, no NextSMS API integration visible yet. |
| [~] | 11 | Dashboard & Reports | Dashboard route has real layout (KPI tiles, date-range picker, data table pattern) but **hardcoded placeholder values** (`value="12%"`) and commented-out data-loading calls — not wired to the `dashboard.ts` worker route's actual output yet (check what that route currently returns before writing new aggregation queries). Reports route is a bare `PageHero` shell only. |
| [ ] | 18 | Tenant self-serve subscription management *(new, inferred — see `build-plan.md`)* | A full `billingsdk`-sourced component suite was added (`components/billingsdk/*`: cancel-subscription card/dialog, update-plan card/dialog, payment-method selector, invoice history) plus matching `*-demo.tsx` files and `lib/billingsdk-config.ts`. **Not wired to any route or nav entry** — confirmed by searching `src/client/routes/`. Config still holds the registry's own placeholder ("Liveblocks") plan data, not real ArdhiFlow pricing. Treat as "components available" not "feature shipped." |

## Phase 4 — Production Readiness

| Status | # | Feature | Notes |
|--------|---|---------|-------|
| [ ] | 12 | Provisioning lifecycle completeness | `organization.deleted` not handled; no abuse protection on the provisioning webhook. |
| [~] | 13 | Migration fan-out for live tenants | **Confirmed built**: `scripts/migrate-tenants.ts` / `migrate-tenants-pg.ts` implement the fan-out job, with per-org dry-run, apply, and schema-version tracking. `SCAFFOLD_NOTES.md` and `project-overview.md` no longer claim it's unbuilt/out of scope. Remaining gap: never run against live infrastructure (see Known Blockers). |
| [ ] | 14 | R2 wiring for tenant files | `TENANT_FILES` binding declared in `wrangler.jsonc`, not yet attached to any request context. |
| [ ] | 15 | Real health checks + observability | `/api/health` returns 200 unconditionally; no structured logging/error tracking beyond Hono's request logger (PostHog error tracking is separately configured client-side — see `library-docs.md`, but that's not the same as server-side observability). |
| [ ] | 16 | Automated tests + CI | No test framework installed, no CI workflow beyond a PR labeler action. |
| [ ] | 17 | Encryption key rotation strategy | No rotation/backup procedure documented for `TENANT_CONN_ENCRYPTION_KEY`. |

---

## Legend

- `[ ]` Not started
- `[~]` In progress (partially built — check the Notes column for exactly what's real vs. stubbed before assuming either way)
- `[x]` Complete (builds and compiles; live-infrastructure verification is a separate concern — see Phase 1 notes)
- `[!]` Blocked — see notes

---

## Current Session Focus

> Feature being worked on right now: **None** — this tracker reflects a point-in-time repo read on 2026-08-17, after PR #3 (`feat-implement-contact-form`) was merged to `main`, not an active session.

## Known Blockers

- Live infrastructure (Neon catalog project, Clerk instance webhook config, Cloudflare KV/R2/Queue resources) has not been confirmed as created/connected — several "complete" Phase 1 items are complete in code but unverified in a live environment. Confirm this before treating provisioning as production-ready.

## Build Notes

<!-- Agent: append a brief note here after each completed feature, in this shape:
  **Feature N — {name}** ({date})
  Files changed: ...
  Decisions: ...
  Next: ...
-->

**Feature 4 — Contacts (create + edit)** (2026-08-17, PR #3 `feat-implement-contact-form`)
Files changed: `components/forms/contacts/add-edit-contact-form.tsx` (new, 797 lines), `components/reui/phone-input.tsx` + `stepper.tsx` (new), `components/ui/combobox.tsx`/`radio-group.tsx`/`toggle.tsx` (new), `components-reusable/reusable-sheet.tsx` (`useSheetControl` un-commented and exported), `reusable-quick-actions.tsx`, `data-grids/contacts-datagrid.tsx`, `routes/_authed/_org/contacts/index.tsx`.
Decisions: one combined `AddEditContactForm` for both add/edit rather than two components; multi-step (`Stepper`) with per-step `zod` validation; new `@billingsdk` registry + `motion`/`react-phone-number-input` deps also landed in this PR but are unrelated scaffolding, not part of this feature.
Next: `view-contact-form.tsx` and `client-statement.tsx` remain stubs — likely the next piece, given the added-but-unused `pdf.svg`/`users.svg` assets.

**Feature 4 follow-up — Contacts edit form: remove data seeding** (2026-08-17)
Files changed: `components/forms/contacts/add-edit-contact-form.tsx` (removed `buildSeedRecord()`, the `useQuery`-based `GET /api/contacts/:id` fetch, and the loading-skeleton branch; `initialData` is now a required-for-edit full `ContactRecord`), `data-grids/contacts-datagrid.tsx` (removed the dead `rowToContactSeed()` helper; `IContact` now `extends ContactRecord` instead of declaring a narrow field subset, since the list endpoint already returns full rows; fixed the resulting `clientPhoto`/`contactType` type mismatches this surfaced).
Decisions: the contacts list (`GET /api/contacts`) already returns full rows, so the grid's in-memory row data was always a complete `ContactRecord` — the old partial-seed-plus-refetch pattern was solving a problem that didn't exist for this resource. The edit form now trusts the caller's `initialData` directly instead of re-fetching by `id`.
Next: unchanged from above.
