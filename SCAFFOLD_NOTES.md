# ArdhiFlow — scaffold notes

Hono + Vite SPA on a single Cloudflare Worker, project-per-tenant Neon,
Clerk Organizations for auth, R2 for tenant files. This picks up from the
original `npm create vite` scaffold — the client app (`src/client`) is
untouched aside from moving it into its own folder and one unused import
removed.

Verified: `npx tsc -b` (clean across all four tsconfigs), `npx eslint .`
(clean except two pre-existing shadcn boilerplate warnings), and
`npx vite build` (both the client bundle and the Worker bundle build
successfully). Not verified: anything requiring live credentials — no Neon
project, Clerk instance, or Cloudflare account was available while building
this, so the actual provisioning flow, webhook delivery, and deploy have not
been run end-to-end. Treat this as a compiling, internally-consistent
starting point, not a tested production path.

## Layout

```
src/
  client/     # React app (Vite), everything that was in src/ before
    routes/            # TanStack Router file routes (see below)
    router.tsx          # router instance + Clerk auth context type
  worker/     # Hono app — the Cloudflare Worker
    index.tsx          # exports { fetch, queue } — the actual Worker entry
    types.ts           # Env bindings + Hono context Variables
    middleware/
      clerk-auth.ts     # verifies Clerk session JWT, requires org_id claim
      tenant-resolver.ts # org_id -> tenant Neon connection (KV cache -> catalog DB)
    routes/
      health.ts
      plots.ts          # example tenant-scoped route (list/create plots)
      webhooks/clerk.ts # organization.created -> enqueues provisioning
    queue/
      provision-tenant.ts # the actual Neon project creation + migration
    lib/
      neon-api.ts        # Neon Management API wrapper
      run-migration.ts   # applies generated SQL to a fresh tenant project
      crypto.ts           # AES-GCM encrypt/decrypt for connection strings
drizzle/
  catalog/    # control-plane schema (orgs, tenant_projects, provisioning_events)
  tenant/     # per-tenant schema (starter: buyers, plots, installments)
scripts/
  provision-tenant.ts   # manual/backfill CLI, reuses the same lib functions
```

**Route tree** (`src/client/routes/`, file-based via `@tanstack/router-plugin`):
```
/                              -> redirects based on auth/org state
/sign-in/$, /sign-up/$          -> Clerk path-routing (splat catches its internal steps)
/_authed                        -> pathless layout: requires signed in
  /onboarding                    -> Clerk OrganizationList — create/select an org
  /_org                          -> pathless layout: requires an active org, renders sidebar shell
    /dashboard                    -> overview
    /dashboard/plots               -> example tenant-scoped page (list + create)
```

## What's real vs. what you still need to do

**Wired and building:**
- Single Worker serving both the Hono API and the built SPA (Workers Assets, SPA fallback)
- `@cloudflare/vite-plugin` — `vite dev` runs the Worker in the real Workers runtime alongside the React app
- Clerk JWT verification middleware + tenant resolver middleware chain
- Catalog DB schema + generated migration SQL
- Tenant DB starter schema + generated migration SQL
- Provisioning pipeline: webhook → Queue → Neon project creation → schema apply → catalog write
- Manual CLI for backfilling/testing provisioning without a live webhook
- Hono RPC (`hc<AppType>`) wired between client and worker for typed API calls — verified end to end: the Drizzle schema's shape flows through drizzle-zod → Hono's zValidator → AppType → the client call, and TypeScript actually rejects bad fields at the call site
- Connection-string encryption at rest (AES-GCM)
- **Client routing (TanStack Router, file-based) + TanStack Query**: `/` → smart redirect, `/sign-in/$` + `/sign-up/$` (Clerk path-routing, splat for its internal sub-steps), `/onboarding` (org create/select via Clerk's `OrganizationList`, shown when signed in with no active org), `/dashboard` + `/dashboard/plots` behind an org-gated layout with a sidebar shell (org switcher, nav, mobile slide-over). Plots page is a full working example: list + create form against the real `tenantDb`-backed API, loading/empty/error states.

**You still need to:**
1. Create the actual Cloudflare resources and fill in `wrangler.jsonc`:
   - `wrangler kv namespace create TENANT_CACHE` → paste the id in
   - `wrangler r2 bucket create ardhi-flow-tenant-files`
   - Queues are created automatically on first `wrangler deploy` given the `queues` config, but double check in the dashboard
2. Set secrets: copy `.dev.vars.example` → `.dev.vars` and `.env.example` → `.env` for local dev (including `VITE_CLERK_PUBLISHABLE_KEY` now), and `wrangler secret put <NAME>` for each in production
3. In the Clerk dashboard: customize the session token to include `org_id`, `org_role`, `org_slug` claims (Sessions → Edit), and add a webhook endpoint for `organization.created` pointing at `/api/webhooks/clerk`
4. Replace the starter tenant schema (`buyers`/`plots`/`installments`) with your real domain model, then `npm run db:generate:tenant` — the plots page is meant as a pattern to copy, not a page to keep as-is
5. Build the migration fan-out job for schema changes to *already-provisioned* tenants — this scaffold only handles migrating brand-new tenants at creation time
6. Run `npm run db:generate:catalog` + `npm run db:migrate:catalog` against your real catalog Neon project to actually create its tables (the SQL is generated, but nothing has been applied anywhere yet)
7. Wire R2 into the tenant-resolver's context (or a separate middleware) the same way `tenantDb` is, scoped to `tenant.r2Prefix`
8. Nothing links to `buyers`/`installments` yet in the UI — only `plots` has a page; add the rest as you build out the domain
9. "Return to where you were" after sign-in isn't wired — the auth gate always redirects to `/sign-in`, and Clerk always lands back on `/dashboard`, not the page that triggered the gate. Worth adding once there's enough navigation depth to matter.

## Audited against current official docs (Context7 + direct doc checks)

Checked the highest-risk patterns against Hono's, Clerk's, and Cloudflare's
current docs rather than trusting memory. Two real gaps found and fixed:

- **Clerk edge verification**: `verifyToken()` was only passed `secretKey`,
  which falls back to a network JWKS fetch. Clerk's docs specifically call
  out `jwtKey` (Clerk dashboard → API Keys → Advanced → JWT public key) for
  networkless verification on V8 isolate runtimes like Workers. Now set as
  `CLERK_JWT_KEY` and passed alongside `secretKey`.
- **Provisioning idempotency**: Cloudflare Queues retries redeliver the
  whole message on any thrown error — confirmed against Cloudflare's own
  docs. Neon's API docs separately confirm `POST` requests (project
  creation) are explicitly *not* safe to retry. Combined, a transient
  failure after project creation but before the catalog write would have
  silently spawned a second, orphaned Neon project on redelivery. Both the
  queue consumer and the CLI script now check for an existing project by
  name first (`findProjectByName` in `lib/neon-api.ts`) and refuse to
  duplicate — instead logging a `provisioning_conflict` event for manual
  reconciliation. **Known limitation of this fix**: it stops duplication,
  but doesn't self-heal — an org that hits this path stays unprovisioned
  (tenant resolver returns 404) until someone manually reconciles via the
  Neon console or `scripts/provision-tenant.ts`.

Confirmed correct as-is: the Hono RPC chaining pattern (`app.route()` calls
chained together, exporting `typeof routes` not `typeof app`) and the
combined `{ fetch, queue }` Worker export both match Hono's official
best-practices docs exactly.

## Is this production-ready?

No — and "audited against docs" and "production-ready" are different bars.
The code that exists follows current framework conventions reasonably well
now, but a real production checklist is much longer than "is each API call
correct":

- **No tests.** `vitest` + `@cloudflare/vitest-pool-workers` were
  recommended early on and never actually set up.
- **No CI/CD.** Nothing runs typecheck/lint/tests on push; deploys are
  manual.
- **Never run against live infrastructure.** Every piece here compiles and
  builds, but no live Neon account, Clerk instance, or Cloudflare account
  was available while building it — the actual provisioning flow, webhook
  delivery, and auth flow have not been exercised end to end in a browser.
- **No cleanup path.** Only `organization.created` is handled. Deleting or
  renaming an org in Clerk currently orphans its Neon project and catalog
  row — no `organization.deleted` handling.
- **No abuse protection on provisioning.** Nothing stops a burst of webhook
  deliveries (malicious or buggy) from exhausting your Neon project quota.
- **No CORS config.** Fine today since the Worker serves both API and
  assets same-origin; becomes a real gap the moment a separate client
  (mobile app, marketing site) needs to call the API.
- **No observability beyond Hono's basic request logger.** No structured
  logging, no error tracking, no alerting on provisioning failures beyond
  the `provisioning_events` table.
- **`/api/health` doesn't check anything real** — it returns 200 without
  touching the catalog DB, KV, or R2.
- **No encryption key rotation strategy** for `TENANT_CONN_ENCRYPTION_KEY`.
  Losing it means losing access to every tenant connection string; there's
  no documented backup/rotation procedure.
- Migration fan-out job and R2 wiring, already flagged below, are still
  unbuilt.

Treat this as a solid, doc-verified starting point for the plumbing — not
as something to point real customer data at yet.

## Local dev

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in real values
cp .env.example .env             # same values, for drizzle-kit/scripts
npm run db:generate:catalog      # already run once, re-run after schema edits
npm run db:migrate:catalog       # apply to your real catalog Neon project
npm run dev                      # Worker + React app, one process
```

## Deploy

```bash
npm run deploy   # vite build && wrangler deploy
```

`wrangler deploy` auto-detects the Vite build output and deploys it directly
(confirmed against Cloudflare's current docs) — no extra bundling step or
`-c` flag needed for this single-worker setup.
