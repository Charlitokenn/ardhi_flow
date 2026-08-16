# ArdhiFlow — Architecture

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | React 19 + Vite 8 (SPA) | No Next/Astro on the app itself — single-page app, no SSR. Marketing site is a separate Astro project in `marketing/`. |
| Language | TypeScript | Strict-ish: `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`, `erasableSyntaxOnly` |
| Routing | TanStack Router (file-based, `@tanstack/router-plugin`) | Route tree auto-generated into `src/client/routeTree.gen.ts` — never hand-edit that file |
| Data fetching | TanStack Query + Hono RPC (`hc<AppType>`) | Fully typed client calls, no manual fetch/JSON parsing, no codegen step beyond TS inference |
| Styling | Tailwind CSS v4 | CSS-first config via `@theme inline` in `index.css` — there is no `tailwind.config.ts` |
| UI Components | shadcn/ui (style `radix-mira`, base color `zinc`) + Radix primitives + `reui`/`diceui` registries | See `components.json` for registry URLs |
| Backend | Hono 4 on a single Cloudflare Worker | Same Worker serves `/api/*` and the built SPA via Workers Assets |
| Auth | Clerk (Organizations) | `@clerk/react` (client), `@clerk/backend` (server JWT verification), `@clerk/ui` (themed sign-in/up) |
| Database | Postgres via Neon serverless driver + Drizzle ORM | Two logically separate DB scopes — see "Database Schema" below |
| Storage | Cloudflare R2 (`TENANT_FILES` binding) | Per-tenant file storage, prefixed by `tenant.r2Prefix`. Not yet wired into the tenant-resolver context (see `SCAFFOLD_NOTES.md`) |
| Queue | Cloudflare Queues (`TENANT_PROVISION_QUEUE`) | Async tenant provisioning: webhook → queue → Neon project creation → migration → catalog write |
| Cache | Cloudflare KV (`TENANT_CACHE`) | 5-minute TTL cache of resolved `orgId → connection string` |
| Analytics/Ops | PostHog (`posthog-js`) | Error tracking, session replay, plot-creation conversion funnel, PostHog Self-driving with GitHub issue sync |
| Deployment | Cloudflare Workers via Wrangler | `npm run deploy` = `vite build && wrangler deploy`; deploy auto-detects the Vite build output |

## Folder Structure

```
ardhi_flow/
├── src/
│   ├── client/                  # React SPA — everything the browser runs
│   │   ├── routes/              # TanStack Router file-based routes (see Route Tree below)
│   │   ├── components/          # UI components — kebab-case filenames throughout
│   │   │   ├── ui/               # shadcn/ui primitives — never edit directly, regenerate via CLI
│   │   │   ├── reui/              # reui registry components (data-grid, badge, date-selector)
│   │   │   ├── data-grids/        # feature-specific TanStack Table grids (contacts, contracts, projects, transactions)
│   │   │   └── forms/              # feature-specific forms (currently: contacts/)
│   │   ├── components-reusable/  # generic cross-feature building blocks (empty state, stats, tooltips, sheets, table action bar)
│   │   ├── constants/            # appConfig — app name, sidebar nav menu definition
│   │   ├── hooks/                # generic React hooks (mobile detection, clipboard, CSV export, etc.)
│   │   ├── lib/                  # api.ts (Hono RPC client), utils.ts, table-filters.ts, export-csv.ts
│   │   ├── types/                # router-types.d.ts, vite-env.d.ts
│   │   ├── index.css              # Tailwind v4 theme + design tokens (see ui-tokens.md)
│   │   ├── main.tsx                # app entry — ClerkProvider, QueryClientProvider, RouterProvider
│   │   ├── router.tsx              # router + queryClient instances, auth context type
│   │   └── routeTree.gen.ts        # AUTO-GENERATED — never hand-edit
│   └── worker/                    # Hono app — the Cloudflare Worker (API + queue consumer)
│       ├── index.ts                # exports { fetch, queue } — the Worker entry point; AppType exported here
│       ├── types.ts                 # Env bindings + Hono context Variables
│       ├── middleware/
│       │   ├── clerk-auth.ts        # verifies Clerk session JWT, requires org_id claim
│       │   └── tenant-resolver.ts   # org_id -> tenant Neon connection (KV cache -> catalog DB)
│       ├── routes/                  # one file per resource: plots, contacts, projects, accounts, contracts, payments, expenses, dashboard
│       │   └── webhooks/clerk.ts    # organization.created -> enqueues provisioning
│       ├── queue/
│       │   └── provision-tenant.ts  # the actual Neon project creation + migration, run by the queue consumer
│       ├── db/catalog.ts             # catalog Drizzle client factory
│       └── lib/
│           ├── neon-api.ts           # Neon Management API wrapper (project create, findProjectByName)
│           ├── run-migration.ts       # applies generated SQL to a fresh tenant project
│           ├── run-migration-pg.ts     # pg-based variant (see scripts/)
│           ├── tenant-migrations.ts     # migration SQL loader
│           └── crypto.ts                # AES-GCM encrypt/decrypt for connection strings
├── drizzle/
│   ├── catalog/                    # control-plane schema (orgs, tenant_projects, provisioning_events) + generated migrations
│   └── tenant/                     # per-tenant schema (contacts, projects, plots, contracts, payments, commissions, expenses, SMS) + generated migrations
├── scripts/                        # CLI equivalents of the queue consumer, for manual/backfill use (provision-tenant, migrate-tenants, seed-tenant)
├── marketing/                       # separate Astro site (own package.json, own AGENTS.md) — not part of this context system
├── context/                          # AI agent context files (this folder)
├── wrangler.jsonc                     # Worker config: bindings, KV/R2/Queue declarations, vars
├── drizzle.catalog.config.ts           # drizzle-kit config for the catalog schema
├── drizzle.tenant.config.ts             # drizzle-kit config for the tenant schema
├── .dev.vars                             # local secrets for `wrangler dev` — never commit
├── .env                                   # local secrets for drizzle-kit/scripts — never commit
└── SCAFFOLD_NOTES.md                       # living log of what's built, what's stubbed, and known gaps — read this before assuming something is missing or broken
```

## Route Tree (TanStack Router, file-based)

```
/                                    -> smart redirect based on auth/org state
/sign-in/$, /sign-up/$                -> Clerk path-routing (splat catches Clerk's internal sub-steps)
/_authed                              -> pathless layout: requires signed in
  /onboarding                          -> Clerk OrganizationList — create/select an org
  /_org                                -> pathless layout: requires an active org, renders sidebar shell
    /dashboard                          -> overview
    /contacts                            -> contacts directory
    /sales                                -> daily sales
    /projects                              -> projects list
    /projects/plots                         -> plots (example: full list + create flow)
    /finance/route.tsx                       -> finance layout
      /finance/transactions                    -> transactions
      /finance/reminder                          -> payment reminders
      /finance/reconciliation                     -> account reconciliation
    /messaging                                  -> SMS campaigns (NextSMS)
    /reports                                     -> reporting
```

## Data Flow

```
Browser (React + TanStack Query)
  -> hc<AppType> typed client (src/client/lib/api.ts), Clerk session token attached as Bearer
  -> Cloudflare Worker (Hono) /api/*
  -> clerkAuth() middleware: verifies JWT, sets userId/orgId/orgRole on context
  -> tenantResolver() middleware: orgId -> KV cache lookup -> (miss) catalog DB lookup -> decrypt connection string -> drizzle(neon(...)) attached as c.get('tenantDb')
  -> route handler: Drizzle query/mutation against the tenant's own Neon project
  -> JSON response, typed end-to-end back to the React Query hook that called it
```

```
Tenant provisioning (async):
Clerk organization.created webhook -> src/worker/routes/webhooks/clerk.ts (verifies Svix signature)
  -> enqueues a message on TENANT_PROVISION_QUEUE
  -> queue consumer (src/worker/queue/provision-tenant.ts):
       1. findProjectByName() in Neon (idempotency check — Neon project creation is not safe to retry)
       2. create Neon project via Management API
       3. apply generated tenant schema SQL
       4. AES-GCM encrypt the connection string, write a tenant_projects row to the catalog DB
       5. log a provisioning_events row at each step
```

## Key Architectural Decisions

### One Worker, one deploy, same-origin API + SPA
The Hono API and the built React SPA are served by the same Cloudflare Worker (`assets.run_worker_first: ["/api/*"]`, SPA fallback via `not_found_handling: "single-page-application"`). This avoids any CORS configuration today, at the cost of needing to add CORS the moment a separate client (mobile app, the `marketing/` Astro site, etc.) needs to call the API directly.

### Project-per-tenant Neon, not row-level multi-tenancy
Each tenant gets a dedicated Neon Postgres project rather than a shared database with a `tenant_id` column on every table. This gives hard data isolation between customers (a bug can never leak one tenant's data into a query for another) at the cost of a provisioning step and a control-plane ("catalog") database that has to stay in sync with what actually exists in Neon. The catalog is treated as a cache of Neon's own state, not the sole source of truth — Neon project names are predictable (`tenant-{orgId}`) specifically so they can be looked up directly if the catalog and Neon ever disagree.

### Clerk Organizations as the tenant boundary
A Clerk "organization" *is* a tenant. The session JWT's `org_id` claim is the only thing the Worker trusts to resolve which Neon project to talk to — there's no separate "tenant ID" concept the app manages itself. This means Clerk's org lifecycle (create/delete/switch) directly drives provisioning lifecycle, which is powerful but also means an unhandled Clerk event (see: no `organization.deleted` handling yet) has real consequences for cleanup.

### Soft delete over hard delete
Every tenant-schema table with a delete operation uses `isDeleted: boolean` rather than removing rows. This preserves referential integrity for historical records (a deleted contact shouldn't break the payment history that references it) at the cost of every read query needing an explicit `isDeleted = false` filter — there's no Postgres-level enforcement of this, so a forgotten filter is a real bug class to watch for in new routes.

## Environment Variables

```bash
# Catalog (control-plane) database
CATALOG_DATABASE_URL=

# Auth
CLERK_SECRET_KEY=
CLERK_JWT_KEY=          # Clerk dashboard -> API Keys -> Advanced -> JWT public key, for networkless verification on Workers
CLERK_WEBHOOK_SECRET=
VITE_CLERK_PUBLISHABLE_KEY=   # non-secret, in wrangler.jsonc `vars` today — client-side publishable key

# Tenant provisioning
NEON_API_KEY=
TENANT_CONN_ENCRYPTION_KEY=   # AES-GCM key; losing it loses access to every tenant connection string — no rotation strategy exists yet

# Non-secret
DEFAULT_TENANT_REGION=aws-eu-central-1
```

All secrets are read from `.dev.vars` locally and set via `wrangler secret put <NAME>` in production. `VITE_CLERK_PUBLISHABLE_KEY` and `DEFAULT_TENANT_REGION` are non-secret and live directly in `wrangler.jsonc` under `vars`. Never hardcode or commit real secret values.

## Database Schema (High-Level)

**Catalog DB** (one project, the control plane):
- **orgs** — id, `clerk_org_id` (unique), name, created_at
- **tenant_projects** — id, `org_id` (unique, Clerk org id — the actual lookup key), `neon_project_id`, `neon_project_name` (`tenant-{orgId}`), region, `encrypted_connection_string` (AES-GCM), `schema_version`, status (`pending`/`provisioning`/`active`/`failed`/`suspended`), `r2_prefix`
- **provisioning_events** — id, `org_id`, event, detail, created_at — append-only log of the provisioning pipeline

**Tenant DB** (one project per org, identical schema across tenants):
- **contacts** — clients, land sellers, auditors, ICT support, surveyors, sales agents (`contact_type` enum); next-of-kin fields; optional `clerk_user_id` for future self-service portal login; `sms_opt_out`
- **projects** — a land acquisition: acquisition date/value, region/district/ward, survey & TP (town-planning) status, `number_of_plots`
- **plots** — belongs to a project; `availability` (AVAILABLE/SOLD); `active_contract_id` (no DB-level FK by design — see AGENTS.md); belongs optionally to a contact
- **accounts** — bank accounts / mobile wallets money moves through
- **plot_sale_contracts** — the installment contract on a plot: client, optional sales agent, purchase plan (FLAT_RATE/DOWNPAYMENT), term, financed amount, commission snapshot, delinquency tracking, cancellation fields. DB-enforced: a plot can have at most one ACTIVE/DELINQUENT contract at a time.
- **contract_installments** — the generated payment schedule per contract; amount due/paid/penalty/waived, status (DUE/PARTIAL/PAID), reschedule count
- **contract_payments** — actual money received (or paid out) against a contract, linked to an account
- **contract_payment_allocations** — join table splitting one payment across one or more installments
- **contract_events** — free-text timeline per contract (system events + internal follow-up comments), optionally scoped to one installment
- **commission_settings** — tenant-wide default commission % and payout-tranche count, seeded onto new contracts
- **commission_payouts** — per-contract commission tranches, released as the client actually pays, each optionally linked to the payment that triggered it
- **expenses** — cash outflows (land acquisition, salary, rent, commission settlement, etc.), optionally linked to an account, payee contact, project, and/or commission payout
- **sms_campaigns / sms_messages / sms_delivery_events** — NextSMS integration: campaign definitions, individual sent messages (with cost, segment count, provider message id), and an append-only webhook delivery log

See `drizzle/tenant/schema.ts` and `drizzle/catalog/schema.ts` for full column definitions, indexes, and relations — they're the source of truth, this is a summary.
