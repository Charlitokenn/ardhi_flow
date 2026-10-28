# Scope: ArdhiFlow

ArdhiFlow is a multi tenant SaaS platform for land plot sales and receivables management, built for land sale and
property companies in Tanzania. Each customer organization gets its own isolated tenant database, and staff use it to
manage plot inventory, installment contracts, payments, commissions, expenses, and client communication in one place.

**Build approach:** Tracer Bullet (each feature is proven end to end through the database, API, and UI before the next
one starts; later slices thicken segments of the same working thread rather than building one layer across everything).
**Workflow:** Beta (after `/develop` builds a feature, run `/check verify` against the real app, then `/test` it; no
separate model review by default). `/architect` is the recommended first stop for any feature tagged `needs a decision`,
skippable when you already know the build. Any feature can carry its own tag to do more or less than this default.

These are recommendations to keep the build orderly, not requirements. Skip anything that does not fit: if you already
know how to build a feature, use `/develop` and skip `/architect`. You decide when a feature is `done`.

## At a glance

| #  | Feature                               | Phase      | Status      |
|----|---------------------------------------|------------|-------------|
| 1  | Multi tenant provisioning pipeline    | Foundation | existing    |
| 2  | Auth and tenant scoped API middleware | Foundation | existing    |
| 3  | App shell and routing                 | Foundation | existing    |
| 4  | Contacts                              | Slice 1    | done        |
| 5  | Projects and Plots                    | Slice 1    | existing    |
| 6  | Sales / Plot Sale Contracts           | Slice 1    | in-progress |
| 7  | Payments and Reconciliation           | Slice 1    | in-progress |
| 8  | Commission tracking                   | Slice 2    | in-progress |
| 9  | Expenses                              | Slice 2    | in-progress |
| 10 | SMS messaging (NextSMS)               | Slice 3    | in-progress |
| 11 | Dashboard and Reports                 | Slice 4    | in-progress |
| 12 | Tenant subscription billing           | Slice 5    | in-progress |
| 13 | Migration fan out for live tenants    | Hardening  | existing    |
| 14 | Provisioning lifecycle completeness   | Hardening  | planned     |
| 15 | R2 wiring for tenant files            | Hardening  | planned     |
| 16 | Real health checks and observability  | Hardening  | planned     |
| 17 | Encryption key rotation strategy      | Hardening  | in-progress |
| 18 | Installment reminders and collections | Slice 1    | existing    |
| 19 | Cached connection string protection   | Hardening  | planned     |
| 20 | Rotation for other Worker secrets     | Hardening  | planned     |

## Foundations

### 1. Multi tenant provisioning pipeline · existing

Clerk `organization.created` webhook to Cloudflare Queue to Neon project creation to schema migration to catalog write,
with an idempotency guard against duplicate Neon projects.
code in `src/worker/queue/provision-tenant.ts`, `src/worker/routes/webhooks/clerk.ts`, `scripts/provision-tenant.ts`

### 2. Auth and tenant scoped API middleware · existing

`clerkAuth()` verifies the Clerk session JWT, then `tenantResolver()` resolves the org to its tenant Neon connection and
attaches a scoped Drizzle client, on every authed route.
code in `src/worker/middleware/clerk-auth.ts`, `src/worker/middleware/tenant-resolver.ts`

### 3. App shell and routing · existing

Full TanStack Router file based tree, sidebar shell, mobile slide over, and Clerk themed auth screens.
code in `src/client/routes/`

## Slice 1: Core sales and collections loop

### 4. Contacts · done

Directory of clients, land sellers, agents, auditors, surveyors, and ICT support, with next of kin details. List,
create, edit, view, client statement, confirmation letter, and CSV bulk import are all wired to real data, per the
accepted spec below. Verified and gated 2026-10-27. **Done when:** viewing a contact goes through a working
`view-contact-form.tsx` sheet, a client statement and a confirmation letter can both be generated for a contact, and the
CSV bulk uploader actually creates contacts.

- [x] Design the remaining pieces (spec): [0001](../specs/0001-contacts-completion/index.md)
- [x] Build it: `/develop contacts`
    - [x] Company branding settings: tenant settings table, `GET`/`PUT /api/company-settings`, "Branding" tab on the
      Clerk "Settings" custom page (spec 0001)
    - [x] Contact view sheet fix and the shared contact detail endpoint (spec 0002)
    - [x] Client statement PDF: real branding, sales agent, and download (spec 0003)
    - [x] Confirmation letter PDF: new document, gated on a fully paid contract (spec 0004)
    - [x] CSV bulk import backend and results summary (spec 0005)
- [x] Verify it: `/check verify contacts` (2026-10-27; four edge cases accepted unverified for lack of seed
  fixtures, left unticked in [verify.md](../specs/0001-contacts-completion/verify.md))
- [x] Test it: `/test contacts` (2026-10-27; Vitest 49 passing, `pnpm test`; Playwright bulk import flow 2 passing,
  `pnpm test:e2e` with `E2E_CLERK_USER_ID` set)
  code in `src/client/components/data-grids/contacts-datagrid.tsx`,
  `src/client/components/forms/contacts/view-contact-form.tsx`,
  `src/client/components/forms/contacts/client-statement.tsx`,
  `src/client/components/forms/contacts/confirmation-letter.tsx`,
  `src/client/components/forms/company/branding-settings-form.tsx`, `src/worker/routes/contacts.ts`,
  `src/worker/routes/company-settings.ts`

### 5. Projects and Plots · existing

Land acquisitions tracked as projects, broken into individually sellable plots, with survey and TP status and
availability tracking. List and create are wired to the real API.
code in `src/worker/routes/projects.ts`, `src/worker/routes/plots.ts`

### 6. Sales / Plot Sale Contracts · in-progress · needs a decision

Installment contracts against a plot, flat rate or downpayment plans, with a database level one active contract per plot
constraint. The listing grid is wired to real data and the `POST /contracts` endpoint (pick plot, pick client, set
terms, generate installment schedule) is fully built. Still missing: the "New Contract" button on the Sales page opens
an empty sheet, contract creation is not wired to any form yet. **Done when:** a user can open "New Contract", complete
the multi step flow, and see the new contract and its installment schedule in the grid.

- [ ] Design the creation flow (spec): `/architect sales contract creation`
  code in `src/worker/routes/contracts.ts`

### 7. Payments and Reconciliation · in-progress · needs a decision

Client payments recorded against installments. Transactions listing and a "Record Transaction" action are wired to real
data. Reconciliation is a bare page header only, with a "New Reconciliation" button wired to nothing, and its nav entry
is commented out (unreachable even by clicking around). **Done when:** an account's incoming and outgoing transactions
can be reconciled against its real balance, with the reconciliation state visible per account.

- [ ] Design the reconciliation flow (spec): `/architect payments reconciliation`
  code in `src/client/routes/_authed/_org/finance/transactions.tsx`

### 18. Installment reminders and collections · existing

A staff facing follow up tool for installments, in the sidebar nav under Finance → Reminder.
`InstallmentsReminderDataGrid` lists every installment, real data via `GET /api/installments`, flattened with client,
plot, and project, and lets staff log and edit follow up comments per installment (`contractEvents`,
`eventType: 'FOLLOWUP_COMMENT'`). A "Receivables Calendar" sheet gives a calendar view of the same data. It used to also have a "Message
Broadcast" sheet opening the same compose flow UI tracked under SMS messaging (feature 10); spec 0003 removes that
sheet in favor of the dedicated `/messaging/broadcasts` page, once built. Predates this workflow, so `/develop` and
`/sync` leave the rest of it alone.
code in `src/client/routes/_authed/_org/finance/reminder.tsx`,
`src/client/components/data-grids/installments-reminder-datagrid.tsx`, `src/worker/routes/installments.ts`

## Slice 2: Commission and expense tracking

### 8. Commission tracking · in-progress · needs a decision

Per contract commission snapshot at sale time, split into payout tranches released as the client actually pays. Schema
(`commission_settings`, `commission_payouts`) and relations are fully built. A real listing page now exists at
`/finance/commissions` (in the sidebar nav under Finance), wired to `GET /api/commissions`, showing each contract's
payout schedule and status. Its "Pay Commission" button opens an empty sheet; recording a payout is still not wired to
anything. **Done when:** an agent or manager can see commission owed and paid per contract, and a payout can be recorded
against a tranche.

- [ ] Design how recording a payout works (spec): `/architect commission tracking`
  code in `src/client/routes/_authed/_org/finance/commissions.tsx`,
  `src/client/components/data-grids/commissions-datagrid.tsx`, `src/worker/routes/commissions.ts`

### 9. Expenses · in-progress · needs a decision

Cash outflows categorized by type (land acquisition, salaries, rent, commissions, and more), attributable to a project
or company wide overhead. Schema and a worker route already exist. No client route or UI exists in the current nav yet.
**Done when:** an expense can be recorded, categorized, and listed against a project or as overhead, from a real page in
the nav.

- [ ] Design the expenses screen (spec): `/architect expenses`
  code in `src/worker/routes/expenses.ts`

## Slice 3: Client communication

### 10. SMS messaging (NextSMS) · in-progress

Templated payment reminder, overdue notice, and marketing campaigns with per message delivery tracking. Schema
(`sms_campaigns`, `sms_messages`, `sms_delivery_events`) is fully modeled. Reusable message templates (create, store,
and preview reminder text) are built — schema, API, and UI (spec 0002) — but not yet verified or tested. The old bare
`/messaging` page is gone, replaced by `/messaging/broadcasts` and `/messaging/templates` in the nav; connecting
`/messaging/broadcasts` to a real dashboard (real campaign list, working navigation into the existing compose flow,
and retiring the Reminder page's now-duplicate entry point) is speced as spec 0003. The compose flow itself
(`broadcast-flow.tsx`) still holds only local state — nothing calls a real send endpoint, and no NextSMS API
integration exists. **Done when:** a campaign can be created from a template, sent to a selected contact list through
NextSMS, and its delivery status tracked per message.

- [x] Design message templates (spec): [0002](../specs/0002-message-templates/index.md)
    - [x] Build it: `/develop message-templates`
        - [x] Schema, seeded defaults, and the render/grouping engine (AC-1, AC-2, AC-5, AC-6, AC-8, AC-11)
        - [x] CRUD + preview API, admin gated (AC-1, AC-3, AC-4, AC-10)
        - [x] Template management screen with live preview (AC-1, AC-3, AC-4, AC-7)
        - [x] "Use a template" picker in the compose flow (AC-9)
        - [x] Sample client preview when no client is picked (AC-7, spec build plan step 7)
    - [ ] Verify it: `/check verify message-templates`
    - [x] Test it: `/test message-templates`
- [x] Design connecting the broadcast dashboard (spec): [0003](../specs/0003-connect-broadcast-dashboard/index.md)
    - [x] Build it: `/develop connect-broadcast-dashboard`
        - [x] Read-only campaigns endpoint (AC-2, AC-5)
        - [x] Dashboard shows real campaign data (AC-1, AC-2)
        - [x] Dashboard <-> compose flow navigation folded into the route (AC-1, AC-3, AC-4)
        - [x] Reminder page's duplicate entry point removed (AC-4)
        - [x] Quick Actions menu's own duplicate entry point removed too (found during build, not in the original spec — same fix, applied consistently)
    - [x] Verify it: `/check verify connect-broadcast-dashboard`
    - [x] Test it: `/test connect-broadcast-dashboard`
- [x] Design the send flow and NextSMS integration (spec): [0004](../specs/0004-sms-send-flow/index.md)
    - [ ] Build it: `/develop sms-send-flow`
        - [ ] One message end to end: migrations, encrypted SMS settings page, NextSMS client, test send, delivery webhook (AC-1, AC-2, AC-3, AC-4, AC-15, AC-18)
        - [x] Campaign drafts and audience: batched due items, segments and skip rules, draft CRUD, preview with cost and balance, real compose flow (AC-5, AC-6, AC-7, AC-8, AC-9, AC-10)
        - [x] Background sending: send endpoint, send queue with crash safety and finalise (AC-11, AC-12, AC-13, AC-14)
        - [x] Delivery tracking: campaign detail sheet, cron and per tenant sweep, docs (AC-13, AC-16, AC-17, AC-18)
    - [ ] Verify it: `/check verify sms-send-flow`
    - [ ] Test it: `/test sms-send-flow`

## Slice 4: Reporting

### 11. Dashboard and Reports · in-progress

Dashboard has real layout (KPI tiles, date range picker, data table pattern) but hardcoded placeholder values and
commented out data loading calls. A `dashboard.ts` worker route already exists. Reports is a bare page header only.
**Done when:** dashboard KPI tiles and the reports page show real aggregated numbers from `dashboard.ts`, not
placeholders.

- [ ] Wire the real data: `/develop dashboard and reports`

## Slice 5: Tenant subscription billing

### 12. Tenant subscription billing · in-progress · needs a decision

Let an org admin view and manage their own ArdhiFlow subscription: plan, payment method, invoices, cancel or upgrade.
Confirmed in scope. A full billing component kit was already added (`components/billingsdk/*`: cancel subscription,
update plan, payment method selector, invoice history) but is not wired to any route, real plan data, or a payment
backend, and the plan config still holds the registry's own placeholder data. **Done when:** a real admin can see their
org's actual plan and invoices, and change or cancel their subscription, from a real settings page in the nav.

- [ ] Design the payment backend, real plan data, and nav placement (spec): `/architect tenant subscription billing`
  code in `src/client/components/billingsdk/`, `src/client/lib/billingsdk-config.ts`

## Hardening

### 13. Migration fan out for live tenants · existing

A job that applies a schema change to every already provisioned tenant project, with per org dry run, apply, and schema
version tracking.
code in `scripts/migrate-tenants.ts`, `scripts/migrate-tenants-pg.ts`

### 14. Provisioning lifecycle completeness · needs a decision

Handle `organization.deleted` (currently unhandled, so deleting or renaming an org in Clerk orphans its Neon project and
catalog row) and add abuse protection on the provisioning webhook. **Done when:** deleting an org in Clerk cleans up or
flags its Neon project and catalog row, and a burst of webhook deliveries cannot exhaust Neon project quota.

- [ ] Design the cleanup and abuse protection approach (spec): `/architect provisioning lifecycle completeness`

### 15. R2 wiring for tenant files

Wire the already declared `TENANT_FILES` R2 binding into the tenant resolver's context, the same way `tenantDb` is,
scoped to `tenant.r2Prefix`. **Done when:** a route can read and write tenant scoped files through R2 using the same
context pattern as `tenantDb`.

- [ ] Build it: `/develop r2 wiring for tenant files`

### 16. Real health checks and observability · needs a decision

`/api/health` currently returns 200 unconditionally. Add real checks against the catalog DB, KV, and R2, plus structured
logging and error tracking beyond Hono's basic request logger. **Done when:** `/api/health` reflects the real state of
its dependencies, and a provisioning failure is both logged and visible somewhere beyond the `provisioning_events`
table.

- [ ] Design what to check and how to log it (spec): `/architect real health checks and observability`

### 17. Encryption key rotation strategy · in-progress

`TENANT_CONN_ENCRYPTION_KEY` has no documented rotation or backup procedure. Losing it loses access to every tenant's
connection string. Designed in spec 0003: a versioned keyring, an operator script for scheduled and emergency rotation,
and a runbook. **Done when:** a rotation procedure exists and has been exercised at least once without breaking any
tenant connection.
code in `src/worker/lib/crypto.ts`, `src/worker/lib/resilient-neon.ts`, `src/worker/lib/neon-api.ts`, `src/worker/middleware/tenant-resolver.ts`, `scripts/rotate-keys.ts`, `drizzle/catalog/schema.ts`, `docs/runbooks/encryption-key-rotation.md`

- [x] Design the rotation and backup procedure (spec): [0003](../specs/0003-encryption-key-rotation/index.md)
- [ ] Build it: `/develop encryption key rotation`
    - [x] Keyring crypto module, versioned format, and call site switch (AC-1, AC-2, AC-3, AC-12)
    - [x] Catalog run table, rotation script, and first run on dev data (AC-5, AC-6, AC-7, AC-8, AC-15)
    - [ ] Scheduled rotation drill with a request loop (AC-4, AC-14)
    - [ ] Emergency mode, Neon helpers, resolver retry, and their drills (AC-9, AC-10, AC-11, AC-14)
    - [ ] Runbook, drill log, and leftover cleanup (AC-13, AC-14, AC-15)
- [ ] Verify it: `/check verify encryption key rotation`
- [ ] Test it: `/test encryption key rotation`

### 19. Cached connection string protection · needs a decision · from spec 0003

The tenant resolver keeps each tenant's decrypted connection string in KV for 5 minutes, outside the protection that the
key rotation in spec 0003 adds. **Done when:** a decision is recorded on whether to encrypt cache values, shorten the
time to live, or accept the exposure, and any chosen change is built.

- [ ] Design the cache protection (spec): `/architect tenant cache connection string protection`

### 20. Rotation for other Worker secrets · needs a decision · from spec 0003

`CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`, `NEON_API_KEY`, and `CATALOG_DATABASE_URL` have no rotation procedure. Spec
0003 covers only the tenant connection encryption key. **Done when:** each secret has a documented rotation procedure
that has been exercised once without breaking sign in, provisioning, or tenant access.

- [ ] Design the rotation procedures (spec): `/architect other secrets rotation`

## Deferred

Out of scope for v1, kept so the plan stays honest.

- **Client config cleanup**: remove the unused server secret entries (`catalogDbUrl`, `neonApiKey`, `clerkSecretKey`,
  `clerkJwtKey`) from the two client `env` objects. Vite does not expose them today (raised by spec 0003).
- **Staging catalog for drills**: decide whether to keep a separate staging catalog and Worker before the first live
  tenant, since later emergency drills would reset real passwords (raised by spec 0003).

- **Client facing self service portal**: contacts already carry an optional `clerkUserId` for this, but no portal UI
  exists yet.
- **Scheduled and recurring SMS campaigns**: `SCHEDULED` stays unused; needs its own spec for cron pickup and East
  Africa Time (raised by spec 0004).
- **One off "send with template" from the Reminders page**: reuses the spec 0004 pipeline with no campaign (raised by
  spec 0004).
- **Rate limit the NextSMS delivery webhook** alongside the provisioning webhook abuse item in feature 14 (raised by
  spec 0004).
- **Mobile apps**: not part of v1.
- **Multi currency support**: not part of v1.
- **Full double entry accounting**: expenses are a cash ledger, not a chart of accounts, for v1.
- **Automated tests and CI**: no test framework or CI workflow beyond a PR labeler, called out as its own hardening
  concern but explicitly out of scope for v1 in `project-overview.md`.

## Legend

**The decision box.** Every feature tagged `needs a decision` carries exactly one sub task ending in `(spec)`. Every
other box is an execution box.

**Feature lifecycle:**

| State                        | Set by                            | The feature shows                                                                                              |
|------------------------------|-----------------------------------|----------------------------------------------------------------------------------------------------------------|
| `planned` · needs a decision | `/scope`                          | one box: `Design it (spec): /architect <feature>`                                                              |
| `in-progress` (designed)     | `/architect` at spec capture      | `Design it` ticked, spec linked, `Build it: /develop <feature>` plus milestones, then the tier's closing boxes |
| `in-progress` (building)     | `/develop`                        | milestone sub boxes tick one by one, code pointer filled                                                       |
| `in-progress` (verified)     | `/check verify`                   | build and milestones ticked, `Verify it` ticked                                                                |
| `done`                       | you, when you decide it is        | the tier's last stage (`Beta` here means after `/test`) is the suggested point to call it done                 |
| `existing`                   | `/scope` at brownfield enrollment | predates this workflow, `/develop` and `/sync` leave it alone                                                  |

- **Next step** = the first unticked box, always a command.
- **needs a decision** = run `/architect` first, otherwise straight to `/develop`. The tag drops once the spec is
  captured.
- **Status**: `planned` to `in-progress` to `done`, plus `existing` (pre workflow) and `dropped` (de scoped, kept for
  history, none yet).
