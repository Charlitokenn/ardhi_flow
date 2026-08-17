# ArdhiFlow — Build Plan

> This is the authoritative feature roadmap. It reflects what's real in the repo today
> (verified by reading the code, not just route names) plus what `SCAFFOLD_NOTES.md`
> flags as outstanding. See `progress-tracker.md` for current status per item.

---

## Phase 1 — Foundation

*Goal: Multi-tenant plumbing, auth, and an app shell that actually renders.*

| # | Feature | Description |
|---|---------|-------------|
| 1 | Multi-tenant provisioning pipeline | Clerk `organization.created` webhook → Cloudflare Queue → Neon project creation → schema migration → catalog write, with idempotency guards against duplicate Neon projects |
| 2 | Auth + tenant-scoped API middleware | `clerkAuth()` (JWT verification, networkless via `CLERK_JWT_KEY`) → `tenantResolver()` (org_id → tenant Drizzle client, KV-cached) chain protecting every `/api/*` route except webhooks/health |
| 3 | App shell + routing | TanStack Router file-based tree with `_authed`/`_org` gating layouts, sidebar shell (org switcher, nav, mobile slide-over), Clerk-themed sign-in/sign-up/onboarding |

---

## Phase 2 — Core Features

*Goal: The primary user value — running plot sales and collections day to day.*

| # | Feature | Description |
|---|---------|-------------|
| 4 | Contacts | Directory of clients/sellers/agents/auditors/surveyors with next-of-kin details; list + create/edit/view forms; optional client-portal login linkage (`clerkUserId`) |
| 5 | Projects & Plots | Land acquisitions ("projects") broken into individually sellable "plots"; availability tracking, survey/TP status |
| 6 | Sales / Plot Sale Contracts | Installment contract creation against a plot (flat-rate or downpayment plans), auto-generated installment schedule, delinquency tracking, cancellation flow |
| 7 | Payments & Reconciliation | Recording client payments against installments (with allocation across multiple installments), account-level (bank/mobile-wallet) reconciliation view |

---

## Phase 3 — Enhancement

*Goal: The features that make ongoing operations actually manageable, not just possible.*

| # | Feature | Description |
|---|---------|-------------|
| 8  | Commission tracking | Per-contract commission snapshot at sale time, tranche-based payout release tied to actual client payments, agent-facing payout visibility |
| 9  | Expenses | Cash-outflow tracking categorized by type (land acquisition, salary, rent, commission settlement, etc.), attributable to a project or company-wide overhead |
| 10 | SMS messaging (NextSMS) | Templated payment-reminder / overdue-notice / marketing campaigns with per-message delivery tracking, opt-out respect |
| 11 | Dashboard & Reports | Company-wide KPI overview (sales, collections, receivables) and reporting surfaces — currently a UI shell with hardcoded placeholder values, not wired to real aggregation queries yet |
| 18 | Tenant self-serve subscription management *(inferred, unconfirmed)* | Let an org admin view/manage their organization's own ArdhiFlow subscription — plan, payment method, invoices, cancel/upgrade. A full `billingsdk`-based UI kit was added to the repo (`components/billingsdk/`) but is not yet wired to any route, real plan data, or a payment backend. This item's existence in the roadmap is an inference from the component addition, not a confirmed spec — validate scope with Charles before building it out. |

---

## Phase 4 — Production Readiness

*Goal: The gap between "compiles and works locally" and "safe to run a real customer's business on."*

| # | Feature | Description |
|---|---------|-------------|
| 12 | Provisioning lifecycle completeness | Handle `organization.deleted` (currently unhandled — deleting/renaming an org in Clerk orphans its Neon project and catalog row); abuse protection on the provisioning webhook |
| 13 | Migration fan-out for live tenants | A job that applies a schema change to every already-provisioned tenant project, not just brand-new ones at creation time (distinct from the one-time migration applied during provisioning) |
| 14 | R2 wiring for tenant files | Wire `TENANT_FILES` R2 binding into the tenant-resolver context (or a sibling middleware) the same way `tenantDb` is, scoped to `tenant.r2Prefix` — currently declared in `wrangler.jsonc` but not attached to any request context |
| 15 | Real health checks + observability | `/api/health` currently returns 200 unconditionally without touching the catalog DB, KV, or R2 — make it check real dependencies; add structured logging/error tracking beyond Hono's basic request logger |
| 16 | Automated tests + CI | No `vitest`/`@cloudflare/vitest-pool-workers` setup and no CI pipeline exist today — `npx tsc -b && npx eslint . && npx vite build` is the current (manual) verification bar |
| 17 | Encryption key rotation strategy | `TENANT_CONN_ENCRYPTION_KEY` has no documented rotation/backup procedure; losing it loses access to every tenant's connection string |

---

## Feature Detail Notes

### Feature 4 — Contacts
The list UI, data grid (`contacts-datagrid.tsx`), and API routes are real and wired to live data. **Create and edit are now fully implemented** via `add-edit-contact-form.tsx` (a single multi-step component, `mode="add" | "edit"`), wired into both the page-level "New Contact" quick action and the datagrid's row-level "Edit" action. Remaining gap: `view-contact-form.tsx` and `client-statement.tsx` are still empty stubs — the datagrid's "View" action currently renders contact details inline rather than through `view-contact-form.tsx`, and there's no client-statement generation (PDF or otherwise) yet, despite `pdf.svg` and `users.svg` assets having been added in anticipation of this.

### Feature 18 — Tenant self-serve subscription management *(new, inferred)*
See the Phase 3 table above. `components/billingsdk/*` gives a ready-made subscription-management UI (cancel flow, plan change dialog, payment-method selector, invoice history) sourced from the new `@billingsdk` registry. Before treating this as buildable: (1) confirm with Charles this is actually intended scope and not just a components pull for future reference, (2) replace the demo plan config in `lib/billingsdk-config.ts`, (3) decide the payment backend (Charles's other projects use PayPal Subscriptions — check whether that pattern applies here too), (4) decide where this surfaces in the nav (likely an org-settings area, which doesn't exist in the current sidebar yet).

### Feature 6 — Sales / Plot Sale Contracts
The schema (`plot_sale_contracts`, `contract_installments`, `contract_payments`, `contract_payment_allocations`, `contract_events`) and worker route (`contracts.ts`) are fully built out, including the DB-enforced "one active/delinquent contract per plot" constraint. `sales/index.tsx` renders `ContractsDataGrid`, which is wired to real API data. Contract *creation* flow (the actual multi-step form for starting a new sale) should be checked against current state before assuming it's missing or present — verify against `contracts.ts`'s POST handler and any accompanying client form before building a duplicate.

### Feature 10 — SMS messaging (NextSMS)
Schema (`sms_campaigns`, `sms_messages`, `sms_delivery_events`) exists and is fully modeled, including delivery-event history separate from the message's current status (NextSMS's webhook can fire more than once per message). The `messaging/index.tsx` route is currently a bare page-hero shell with no grid or send flow — this is greenfield UI work, not a refactor.

### Feature 11 — Dashboard & Reports
Both routes render real layout (`PageHero`, `ReusableStats`, a date-range picker, a data table pattern) but with **hardcoded placeholder values** (`value="12%"` on every KPI tile) and commented-out data-loading calls (`// loadSales(range.from, range.to)` etc.) in `dashboard/index.tsx`. There is a `dashboard.ts` worker route already — check what it currently returns before assuming the aggregation queries need to be written from scratch.

### Feature 3 (infra prerequisite, not a UI feature)
Before any of Phase 2–4 can run against real data end-to-end, the actual Cloudflare resources need to be created and connected (`wrangler kv namespace create TENANT_CACHE`, `wrangler r2 bucket create ardhi-flow-tenant-files`, secrets set via `wrangler secret put`), and the Clerk dashboard needs the session-token claim customization + webhook endpoint registered. `SCAFFOLD_NOTES.md` → "Local dev" and "You still need to" sections are the authoritative checklist for this.
