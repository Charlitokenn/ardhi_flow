# Scope: ArdhiFlow

ArdhiFlow is a multi tenant SaaS platform for land plot sales and receivables management, built for land sale and property companies in Tanzania. Each customer organization gets its own isolated tenant database, and staff use it to manage plot inventory, installment contracts, payments, commissions, expenses, and client communication in one place.

**Build approach:** Tracer Bullet (each feature is proven end to end through the database, API, and UI before the next one starts; later slices thicken segments of the same working thread rather than building one layer across everything).
**Workflow:** Beta (after `/develop` builds a feature, run `/check verify` against the real app, then `/test` it; no separate model review by default). `/architect` is the recommended first stop for any feature tagged `needs a decision`, skippable when you already know the build. Any feature can carry its own tag to do more or less than this default.

These are recommendations to keep the build orderly, not requirements. Skip anything that does not fit: if you already know how to build a feature, use `/develop` and skip `/architect`. You decide when a feature is `done`.

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| 1 | Multi tenant provisioning pipeline | Foundation | existing |
| 2 | Auth and tenant scoped API middleware | Foundation | existing |
| 3 | App shell and routing | Foundation | existing |
| 4 | Contacts | Slice 1 | in-progress |
| 5 | Projects and Plots | Slice 1 | existing |
| 6 | Sales / Plot Sale Contracts | Slice 1 | in-progress |
| 7 | Payments and Reconciliation | Slice 1 | in-progress |
| 8 | Commission tracking | Slice 2 | in-progress |
| 9 | Expenses | Slice 2 | in-progress |
| 10 | SMS messaging (NextSMS) | Slice 3 | in-progress |
| 11 | Dashboard and Reports | Slice 4 | in-progress |
| 12 | Tenant subscription billing | Slice 5 | in-progress |
| 13 | Migration fan out for live tenants | Hardening | existing |
| 14 | Provisioning lifecycle completeness | Hardening | planned |
| 15 | R2 wiring for tenant files | Hardening | planned |
| 16 | Real health checks and observability | Hardening | planned |
| 17 | Encryption key rotation strategy | Hardening | planned |

## Foundations

### 1. Multi tenant provisioning pipeline · existing
Clerk `organization.created` webhook to Cloudflare Queue to Neon project creation to schema migration to catalog write, with an idempotency guard against duplicate Neon projects.
code in `src/worker/queue/provision-tenant.ts`, `src/worker/routes/webhooks/clerk.ts`, `scripts/provision-tenant.ts`

### 2. Auth and tenant scoped API middleware · existing
`clerkAuth()` verifies the Clerk session JWT, then `tenantResolver()` resolves the org to its tenant Neon connection and attaches a scoped Drizzle client, on every authed route.
code in `src/worker/middleware/clerk-auth.ts`, `src/worker/middleware/tenant-resolver.ts`

### 3. App shell and routing · existing
Full TanStack Router file based tree, sidebar shell, mobile slide over, and Clerk themed auth screens.
code in `src/client/routes/`

## Slice 1: Core sales and collections loop

### 4. Contacts · in-progress
Directory of clients, land sellers, agents, auditors, surveyors, and ICT support, with next of kin details. List, create, edit, view, client statement, confirmation letter, and CSV bulk import are all wired to real data, per the accepted spec below. Awaiting `/check verify` and `/test`.
**Done when:** viewing a contact goes through a working `view-contact-form.tsx` sheet, a client statement and a confirmation letter can both be generated for a contact, and the CSV bulk uploader actually creates contacts.
- [x] Design the remaining pieces (spec): [0001](../specs/0001-contacts-completion/index.md)
- [x] Build it: `/develop contacts`
  - [x] Company branding settings: tenant settings table, `GET`/`PUT /api/company-settings`, Clerk "Branding" custom page (spec 0001)
  - [x] Contact view sheet fix and the shared contact detail endpoint (spec 0002)
  - [x] Client statement PDF: real branding, sales agent, and download (spec 0003)
  - [x] Confirmation letter PDF: new document, gated on a fully paid contract (spec 0004)
  - [x] CSV bulk import backend and results summary (spec 0005)
- [ ] Verify it: `/check verify contacts`
- [ ] Test it: `/test contacts`
code in `src/client/components/data-grids/contacts-datagrid.tsx`, `src/client/components/forms/contacts/view-contact-form.tsx`, `src/client/components/forms/contacts/client-statement.tsx`, `src/client/components/forms/contacts/confirmation-letter.tsx`, `src/client/components/forms/company/branding-settings-form.tsx`, `src/worker/routes/contacts.ts`, `src/worker/routes/company-settings.ts`

### 5. Projects and Plots · existing
Land acquisitions tracked as projects, broken into individually sellable plots, with survey and TP status and availability tracking. List and create are wired to the real API.
code in `src/worker/routes/projects.ts`, `src/worker/routes/plots.ts`

### 6. Sales / Plot Sale Contracts · in-progress · needs a decision
Installment contracts against a plot, flat rate or downpayment plans, with a database level one active contract per plot constraint. The listing grid is wired to real data and the `POST /contracts` endpoint (pick plot, pick client, set terms, generate installment schedule) is fully built. Still missing: the "New Contract" button on the Sales page opens an empty sheet, contract creation is not wired to any form yet.
**Done when:** a user can open "New Contract", complete the multi step flow, and see the new contract and its installment schedule in the grid.
- [ ] Design the creation flow (spec): `/architect sales contract creation`
code in `src/worker/routes/contracts.ts`

### 7. Payments and Reconciliation · in-progress · needs a decision
Client payments recorded against installments. Transactions listing and a "Record Transaction" action are wired to real data. Reconciliation is a bare page header only, with a "New Reconciliation" button wired to nothing.
**Done when:** an account's incoming and outgoing transactions can be reconciled against its real balance, with the reconciliation state visible per account.
- [ ] Design the reconciliation flow (spec): `/architect payments reconciliation`
code in `src/client/routes/_authed/_org/finance/transactions.tsx`

## Slice 2: Commission and expense tracking

### 8. Commission tracking · in-progress · needs a decision
Per contract commission snapshot at sale time, split into payout tranches released as the client actually pays. Schema (`commission_settings`, `commission_payouts`) and relations are fully built. No UI surface exists yet, and it is not on the sidebar nav.
**Done when:** an agent or manager can see commission owed and paid per contract, and a payout can be recorded against a tranche.
- [ ] Design where and how this surfaces (spec): `/architect commission tracking`

### 9. Expenses · in-progress · needs a decision
Cash outflows categorized by type (land acquisition, salaries, rent, commissions, and more), attributable to a project or company wide overhead. Schema and a worker route already exist. No client route or UI exists in the current nav yet.
**Done when:** an expense can be recorded, categorized, and listed against a project or as overhead, from a real page in the nav.
- [ ] Design the expenses screen (spec): `/architect expenses`
code in `src/worker/routes/expenses.ts`

## Slice 3: Client communication

### 10. SMS messaging (NextSMS) · in-progress · needs a decision
Templated payment reminder, overdue notice, and marketing campaigns with per message delivery tracking. Schema (`sms_campaigns`, `sms_messages`, `sms_delivery_events`) is fully modeled. The messaging route is a bare page header with no grid or send flow yet, and no NextSMS API integration exists.
**Done when:** a campaign can be created from a template, sent to a selected contact list through NextSMS, and its delivery status tracked per message.
- [ ] Design the send flow and NextSMS integration (spec): `/architect sms messaging`

## Slice 4: Reporting

### 11. Dashboard and Reports · in-progress
Dashboard has real layout (KPI tiles, date range picker, data table pattern) but hardcoded placeholder values and commented out data loading calls. A `dashboard.ts` worker route already exists. Reports is a bare page header only.
**Done when:** dashboard KPI tiles and the reports page show real aggregated numbers from `dashboard.ts`, not placeholders.
- [ ] Wire the real data: `/develop dashboard and reports`

## Slice 5: Tenant subscription billing

### 12. Tenant subscription billing · in-progress · needs a decision
Let an org admin view and manage their own ArdhiFlow subscription: plan, payment method, invoices, cancel or upgrade. Confirmed in scope. A full billing component kit was already added (`components/billingsdk/*`: cancel subscription, update plan, payment method selector, invoice history) but is not wired to any route, real plan data, or a payment backend, and the plan config still holds the registry's own placeholder data.
**Done when:** a real admin can see their org's actual plan and invoices, and change or cancel their subscription, from a real settings page in the nav.
- [ ] Design the payment backend, real plan data, and nav placement (spec): `/architect tenant subscription billing`
code in `src/client/components/billingsdk/`, `src/client/lib/billingsdk-config.ts`

## Hardening

### 13. Migration fan out for live tenants · existing
A job that applies a schema change to every already provisioned tenant project, with per org dry run, apply, and schema version tracking.
code in `scripts/migrate-tenants.ts`, `scripts/migrate-tenants-pg.ts`

### 14. Provisioning lifecycle completeness · needs a decision
Handle `organization.deleted` (currently unhandled, so deleting or renaming an org in Clerk orphans its Neon project and catalog row) and add abuse protection on the provisioning webhook.
**Done when:** deleting an org in Clerk cleans up or flags its Neon project and catalog row, and a burst of webhook deliveries cannot exhaust Neon project quota.
- [ ] Design the cleanup and abuse protection approach (spec): `/architect provisioning lifecycle completeness`

### 15. R2 wiring for tenant files
Wire the already declared `TENANT_FILES` R2 binding into the tenant resolver's context, the same way `tenantDb` is, scoped to `tenant.r2Prefix`.
**Done when:** a route can read and write tenant scoped files through R2 using the same context pattern as `tenantDb`.
- [ ] Build it: `/develop r2 wiring for tenant files`

### 16. Real health checks and observability · needs a decision
`/api/health` currently returns 200 unconditionally. Add real checks against the catalog DB, KV, and R2, plus structured logging and error tracking beyond Hono's basic request logger.
**Done when:** `/api/health` reflects the real state of its dependencies, and a provisioning failure is both logged and visible somewhere beyond the `provisioning_events` table.
- [ ] Design what to check and how to log it (spec): `/architect real health checks and observability`

### 17. Encryption key rotation strategy · needs a decision
`TENANT_CONN_ENCRYPTION_KEY` has no documented rotation or backup procedure. Losing it loses access to every tenant's connection string.
**Done when:** a rotation procedure exists and has been exercised at least once without breaking any tenant connection.
- [ ] Design the rotation and backup procedure (spec): `/architect encryption key rotation strategy`

## Deferred
Out of scope for v1, kept so the plan stays honest.
- **Client facing self service portal**: contacts already carry an optional `clerkUserId` for this, but no portal UI exists yet.
- **Mobile apps**: not part of v1.
- **Multi currency support**: not part of v1.
- **Full double entry accounting**: expenses are a cash ledger, not a chart of accounts, for v1.
- **Automated tests and CI**: no test framework or CI workflow beyond a PR labeler, called out as its own hardening concern but explicitly out of scope for v1 in `project-overview.md`.

## Legend

**The decision box.** Every feature tagged `needs a decision` carries exactly one sub task ending in `(spec)`. Every other box is an execution box.

**Feature lifecycle:**

| State | Set by | The feature shows |
|---|---|---|
| `planned` · needs a decision | `/scope` | one box: `Design it (spec): /architect <feature>` |
| `in-progress` (designed) | `/architect` at spec capture | `Design it` ticked, spec linked, `Build it: /develop <feature>` plus milestones, then the tier's closing boxes |
| `in-progress` (building) | `/develop` | milestone sub boxes tick one by one, code pointer filled |
| `in-progress` (verified) | `/check verify` | build and milestones ticked, `Verify it` ticked |
| `done` | you, when you decide it is | the tier's last stage (`Beta` here means after `/test`) is the suggested point to call it done |
| `existing` | `/scope` at brownfield enrollment | predates this workflow, `/develop` and `/sync` leave it alone |

- **Next step** = the first unticked box, always a command.
- **needs a decision** = run `/architect` first, otherwise straight to `/develop`. The tag drops once the spec is captured.
- **Status**: `planned` to `in-progress` to `done`, plus `existing` (pre workflow) and `dropped` (de scoped, kept for history, none yet).
