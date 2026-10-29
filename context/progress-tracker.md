# ArdhiFlow — Progress Tracker

Last updated: 2026-10-29 (sales contract creation, spec 0005)

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
| [~] | 6 | Sales / Plot Sale Contracts | Contract creation built per spec 0005 (2026-10-29): `POST /api/contracts` validates, recomputes the plan with the shared `buildContractPlan` (`packages/shared-schema/src/types/contracts.ts`) and writes contract, contract plots, installments, commission payouts, a `CREATED` event and the plots SOLD in one `db.batch()`; the client supplied `id` makes a retry return the saved contract (200). New read only `GET /api/commission-settings`. `DELETE /api/contracts/:id` is gated with 409 until cancellation exists. The Sales grid has a "New Contract" button opening the four step `NewContractSheet`. Plots gained `price_per_sqm` (form, inline edit, CSV `pricePerSqm`), and plot bodies no longer accept `availability`, `activeContractId` or `contactId`. Tenant migration `0009_contract_creation.sql` applied to both live tenants on 2026-10-29 (first live run of `migrate-tenants.ts`) and confirmed via `information_schema`. **Still owed:** the flow has not been driven end to end in a browser (`/check verify`), and existing plots have no `price_per_sqm` yet, so none can be sold until staff set one. |
| [~] | 7 | Payments & Reconciliation | Transactions: `TransactionsDataGrid` (866 lines) wired to real data, route has a "Record Transaction" CTA. Reconciliation: route is a bare `PageHero` shell with a "New Reconciliation" button that isn't wired to anything yet — no reconciliation UI exists beyond the page header. |

## Phase 3 — Enhancement

| Status | # | Feature | Notes |
|--------|---|---------|-------|
| [ ] | 8  | Commission tracking | Schema (`commission_settings`, `commission_payouts`) and relations fully built. No dedicated UI surface found yet (not on the sidebar nav, no dedicated route) — likely surfaces inside the contract detail view once that exists, or needs its own page. |
| [ ] | 9  | Expenses | Schema fully built (`expenses` table, category enum, links to accounts/payees/projects/commission payouts) and a worker route (`expenses.ts`) exists. No dedicated client route/UI found in the current nav — confirm before building, since the worker side is already there. |
| [ ] | 10 | SMS messaging (NextSMS) | Schema (`sms_campaigns`, `sms_messages`, `sms_delivery_events`) fully built. Message templates (spec 0002) built at `/messaging/templates`: CRUD + preview API, seeded Swahili defaults, editor with live preview, a Preview row action open to every staff member, and a "Use a template" picker in the compose flow. The editor previews against a fixed sample client ("James") until a real client is picked (AC-7). Not yet verified or tested. Send flow (spec 0004) built: per tenant NextSMS settings page (encrypted token, webhook URL), test send, delivery webhook, campaign drafts with audience rules and skip reasons, cost vs balance check, queue backed sending with crash safety, campaign detail sheet, and a 30 minute delivery sweep. Webhook proven against a real NextSMS account on dev (step 7; the test came back `UNDELIVERABLE`, so a real `DELIVERED` is still unseen). Not yet verified or tested. |
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

**Feature 4 follow-up — Contacts verify fixes** (2026-10-27)
Files changed: `worker/routes/contacts.ts` (bulk row schema now requires `fullName`, `mobileNumber`, `contactType`), `components-reusable/reusable-csv-uploader.tsx` (new opt in `serverValidatesRequiredFields` prop), `routes/_authed/_org/contacts/index.tsx` (opts in), `components/forms/company/branding-settings-form.tsx` (read only org name and logo from Clerk).
Decisions: `createInsertSchema` takes "required" from the table, where `mobile_number` is nullable and `contact_type` has a default, so the bulk route overrides those fields to match spec 0005 AC-4. The uploader's per row server validation is opt in because projects/plots never needed it.
Next: run `/check verify contacts` again; 0001 AC-3 still needs a plain `org:member` user to verify. This tracker's table above predates spec 0001 and is stale for Contacts.

**Broadcast dashboard (spec 0003) + desktop app integration** (2026-10-27, merge of `implement-monorepo`)
Files changed: web: `worker/routes/campaigns.ts` (new, read only), `data-grids/campaigns-datagrid.tsx` (new), `messaging/broadcast-dashboard.tsx` (`onCreateNew` required again), `routes/_authed/_org/messaging/broadcasts.tsx` (owns the dashboard/compose toggle), Reminder page and Quick Actions entry points removed. Desktop: `apps/desktop/*` renamed to `@ardhiflow/desktop*`, folded into pnpm (`pnpm-workspace.yaml` adds `apps/desktop/packages/*`) and Turbo, template renderer scaffolder removed; root `dev:desktop` / `compile:desktop` scripts.
Decisions: the desktop window loads the web app by URL (dev server in dev, `VITE_WEB_APP_URL` when packaged) instead of bundling the SPA, because `/api/*` and Clerk need a real origin. See `apps/desktop/AGENTS.md`.
Next: `/check verify connect-broadcast-dashboard`; for desktop (distributed via the Microsoft Store): add an `appx` target, allow Clerk OAuth origins, and turn off the self-updater in Store builds. Follow-up (2026-10-27): `messaging-portal.tsx` deleted (spec 0003 AC-4).

**Marketing site build fix** (2026-10-27)
Files changed: `apps/marketing/astro.config.mjs` (`@astrojs/cloudflare` adapter, `@astrojs/react`, `session: false`, `imageService: 'compile'`), `wrangler.jsonc` (Worker entry `@astrojs/cloudflare/entrypoints/server`, `ASSETS` binding), `src/middleware.ts` (new: sets `locals.countryCode` from Cloudflare geolocation), `src/env.d.ts` (new: `App.Locals` type), `Pricing.astro` (removed import of a nonexistent `ui/button`); deps: React 19 + `lucide-react`/`radix-ui`/`clsx`/`tailwind-merge` for the pricing toggle, astro ^7.4.0 and wrangler ^4.152.0 (adapter peer ranges).
Decisions: kept on demand rendering (index and Pricing set `prerender = false` for country aware pricing) and added the adapter, rather than making the site static. Nothing set `countryCode` before, so every visitor got the non-Tanzania copy.
Next: `wrangler deploy` now deploys a Worker plus assets, not assets only.
