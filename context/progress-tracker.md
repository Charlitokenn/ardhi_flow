# ArdhiFlow — Progress Tracker

Last updated: 2026-08-16

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
| [~] | 4 | Contacts | List page + `ContactsDataGrid` (635 lines) wired to real `useQuery`/API data. `add-contact-form.tsx` / `edit-contact-form.tsx` / `view-contact-form.tsx` / `client-statement.tsx` exist as **empty stub files** — this is the concrete next step, not a design decision still open. |
| [x] | 5 | Projects & Plots | `ProjectsDataGrid` (666 lines) and the plots page (per `SCAFFOLD_NOTES.md`, a full list+create example against the real API) both wired to live data. |
| [~] | 6 | Sales / Plot Sale Contracts | Schema + worker route (`contracts.ts`) fully built, including the DB-level "one active contract per plot" constraint. `ContractsDataGrid` (701 lines) wired to real data. **Verify against `contracts.ts` and any accompanying client form whether contract *creation* (multi-step: pick plot, client, terms, generate installment schedule) is wired in the UI yet** before assuming it needs to be built from scratch. |
| [~] | 7 | Payments & Reconciliation | Transactions: `TransactionsDataGrid` (866 lines) wired to real data, route has a "Record Transaction" CTA. Reconciliation: route is a bare `PageHero` shell with a "New Reconciliation" button that isn't wired to anything yet — no reconciliation UI exists beyond the page header. |

## Phase 3 — Enhancement

| Status | # | Feature | Notes |
|--------|---|---------|-------|
| [ ] | 8  | Commission tracking | Schema (`commission_settings`, `commission_payouts`) and relations fully built. No dedicated UI surface found yet (not on the sidebar nav, no dedicated route) — likely surfaces inside the contract detail view once that exists, or needs its own page. |
| [ ] | 9  | Expenses | Schema fully built (`expenses` table, category enum, links to accounts/payees/projects/commission payouts) and a worker route (`expenses.ts`) exists. No dedicated client route/UI found in the current nav — confirm before building, since the worker side is already there. |
| [ ] | 10 | SMS messaging (NextSMS) | Schema (`sms_campaigns`, `sms_messages`, `sms_delivery_events`) fully built. `messaging/index.tsx` is a bare `PageHero` shell — no grid, no send flow, no NextSMS API integration visible yet. |
| [~] | 11 | Dashboard & Reports | Dashboard route has real layout (KPI tiles, date-range picker, data table pattern) but **hardcoded placeholder values** (`value="12%"`) and commented-out data-loading calls — not wired to the `dashboard.ts` worker route's actual output yet (check what that route currently returns before writing new aggregation queries). Reports route is a bare `PageHero` shell only. |

## Phase 4 — Production Readiness

| Status | # | Feature | Notes |
|--------|---|---------|-------|
| [ ] | 12 | Provisioning lifecycle completeness | `organization.deleted` not handled; no abuse protection on the provisioning webhook. |
| [ ] | 13 | Migration fan-out for live tenants | `scripts/migrate-tenants.ts` / `migrate-tenants-pg.ts` exist — verify whether these already implement the fan-out job before assuming it's unbuilt; `SCAFFOLD_NOTES.md` (written earlier in the project) flags it as missing, but the schema and scripts have grown since then. |
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

> Feature being worked on right now: **None** — this tracker was seeded from a point-in-time repo read on 2026-08-16, not from an active session.

## Known Blockers

- Live infrastructure (Neon catalog project, Clerk instance webhook config, Cloudflare KV/R2/Queue resources) has not been confirmed as created/connected — several "complete" Phase 1 items are complete in code but unverified in a live environment. Confirm this before treating provisioning as production-ready.

## Build Notes

<!-- Agent: append a brief note here after each completed feature, in this shape:
  **Feature N — {name}** ({date})
  Files changed: ...
  Decisions: ...
  Next: ...
-->
