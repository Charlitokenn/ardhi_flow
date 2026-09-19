# apps/web — the main ArdhiFlow app

## Overview

The product itself: a React 19 SPA and the Hono 4 Cloudflare Worker, built together in one Vite 8 project via `@cloudflare/vite-plugin`. Everything the root `AGENTS.md` describes (tenant middleware chain, Hono RPC, Drizzle scopes, Clerk orgs) lives here. This workspace is also the type source for the other clients: it exports `AppType` so `apps/mobile` and `packages/api-client` can call the same typed API.

## Key files

| File | Owns |
|---|---|
| `src/worker/index.ts` | The Worker `app`, route mounting, and `export type AppType = typeof routes` |
| `src/worker/routes/` | One kebab-case file per resource (`contacts.ts`, `plots.ts`, …), all mounted under `/api/*` behind `clerkAuth()` then `tenantResolver()` |
| `src/worker/routes/webhooks/` | Clerk + queue webhook handlers (the only routes that skip the tenant chain) |
| `src/worker/middleware/` | `clerk-auth.ts`, `tenant-resolver.ts` (KV cache then catalog DB, attaches `c.get('tenantDb')`) |
| `src/worker/db/` | Catalog and tenant Drizzle schema access |
| `src/worker/queue/` | Tenant provisioning queue consumer |
| `src/worker/durable-objects/` | `TenantPresence` DO (one instance per Clerk org) |
| `src/client/lib/api.ts` | The typed RPC client (`hc<AppType>`); never hand-roll fetches to `/api/*` |
| `drizzle.catalog.config.ts` | Catalog schema (`./drizzle/catalog/schema.ts`), needs `CATALOG_DATABASE_URL` |
| `drizzle.tenant.config.ts` | Tenant schema (`./drizzle/tenant/schema.ts`); generate-only, see Gotchas |
| `scripts/` | tsx ops scripts: `provision-tenant.ts`, `migrate-tenants.ts` / `migrate-tenants-pg.ts`, `seed-tenant.ts` / `seed-tenant-pg.ts` |
| `wrangler.jsonc` | Worker bindings: KV `TENANT_CACHE`, R2 bucket, Queue `tenant-provisioning` (+ DLQ), DO `TENANT_PRESENCE` |

## Commands

```bash
# From the repo root (pnpm + turbo)
pnpm -F @ardhiflow/web dev      # Vite dev (Worker runs inside the dev server)
pnpm -F @ardhiflow/web build    # tsc -b && vite build
pnpm -F @ardhiflow/web lint     # eslint .
pnpm -F @ardhiflow/web deploy   # build && wrangler deploy

# Database
pnpm -F @ardhiflow/web db:generate:catalog   # drizzle-kit generate (catalog scope)
pnpm -F @ardhiflow/web db:migrate:catalog    # apply to the catalog DB
pnpm -F @ardhiflow/web db:generate:tenant    # emit tenant migration SQL only
pnpm -F @ardhiflow/web provision:tenant      # create one tenant Neon project
pnpm -F @ardhiflow/web migrate:tenants       # fan SQL out to live tenants
```

## Conventions

- All root `AGENTS.md` rules apply verbatim (kebab-case files, middleware chain, soft deletes, typed RPC).
- The client imports the Worker **type-only** (`import type {AppType} from '../../worker'`), so no Drizzle/Neon/Clerk-backend runtime code ever reaches the client bundle.
- `apps/web` exports `./worker` (types only) in `package.json`; that is how `apps/mobile` types its API calls. Keep it.
- A new resource route = a new file in `src/worker/routes/`, registered in `src/worker/index.ts`, validated with `zValidator` against a `drizzle-zod` schema (from `packages/shared-schema` where shared with mobile).

## Gotchas

- **Tenant migrations are never applied by drizzle-kit.** `drizzle.tenant.config.ts` points at the catalog URL only to generate SQL; applying that SQL to each tenant DB is the queue consumer's and `scripts/migrate-tenants*.ts`'s job.
- **R2 binding name mismatch.** `wrangler.jsonc` binds the bucket as `ardhi_flow_tenant_files`, but `src/worker/types.ts` declares `TENANT_FILES: R2Bucket`, and no route reads it yet (R2 wiring is a planned scope item). Resolve the name before writing the first upload route.
- **Only `/api/*` reaches the Worker.** `run_worker_first: ["/api/*"]` in `wrangler.jsonc`; anything else gets the SPA fallback from Workers Assets. The presence websocket must live under `/api/party/*`, not `/party/*`.
- `TENANT_CACHE` KV runs with `"remote": false` locally, with a TODO to return it to `true` in production — do not flip it without checking that note.
- The tsx ops scripts set `NODE_OPTIONS=--dns-result-order=ipv4first` (Neon TLS hangs on IPv6 here); keep it when adding new scripts.

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
