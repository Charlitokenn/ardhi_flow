---
description: Rules and context for AI agents building ArdhiFlow
globs: "*"
alwaysApply: true
---

# ArdhiFlow — Agent Configuration

## Read Before Anything Else

Read the context files in this exact order before writing any code:

1. `context/project-overview.md`
2. `context/architecture.md`
3. `context/ui-tokens.md`
4. `context/ui-rules.md`
5. `context/ui-registry.md`
6. `context/code-standards.md`
7. `context/library-docs.md`
8. `context/build-plan.md`
9. `context/progress-tracker.md`

## Rules That Never Change

- Never bypass the auth/tenant middleware chain — every authed API route must go through `clerkAuth()` then `tenantResolver()`, and pull the tenant's Drizzle client via `c.get('tenantDb')`. Never open a Neon connection any other way inside a route.
- Never use hardcoded hex values or arbitrary Tailwind values in client code — always use the CSS variables / mapped Tailwind classes defined in `context/ui-tokens.md`.
- Never install a new library without checking `context/library-docs.md` first — several libraries here (Clerk, Neon, Hono, Tailwind v4) have project-specific integration notes that differ from generic docs.
- Never declare a Drizzle-level foreign key on `plots.activeContractId` — it's intentionally left untyped at the schema level to avoid a circular table-init error; the real FK constraint is added in the generated migration SQL only. Follow the same pattern for any other forward-reference you introduce.
- Update `context/progress-tracker.md` and `context/ui-registry.md` after every completed feature.
- If the same bug persists after one corrective prompt — stop, re-read `SCAFFOLD_NOTES.md` and `context/architecture.md`, and reassess rather than repeating the same fix.
- Before using any third-party library, check `context/library-docs.md` for project-specific notes.
- This project has **no automated tests and no CI/CD** (see `context/code-standards.md`) — `npx tsc -b`, `npx eslint .`, and `npx vite build` are the verification bar for now. Run all three before considering a change done.

## Tech Stack Quick Reference

- **Frontend**: React 19 SPA built with Vite 8 — no meta-framework, TanStack Router (file-based) handles routing
- **Language**: TypeScript, strict-ish config (`noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`, `erasableSyntaxOnly`)
- **Styling**: Tailwind CSS v4 (CSS-first `@theme inline` config, no `tailwind.config.ts`) + shadcn/ui (style: `radix-mira`, base color `zinc`) + `tw-animate-css`
- **Backend**: Hono 4 running as a single Cloudflare Worker — serves both the `/api/*` routes and the built SPA (Workers Assets, SPA fallback)
- **Auth**: Clerk with Organizations (`@clerk/react`, `@clerk/backend`, `@clerk/ui`) — one Clerk org = one tenant
- **Database**: Postgres via Neon serverless driver + Drizzle ORM, split into two scopes — a single **catalog** project (control plane) and one **tenant** Neon project per org
- **Storage**: Cloudflare R2 (`TENANT_FILES` binding) for per-tenant file storage, key-prefixed by `tenant.r2Prefix`
- **Async work**: Cloudflare Queues (`TENANT_PROVISION_QUEUE`) — Clerk `organization.created` webhook enqueues, a queue consumer does the actual Neon project creation + schema migration off the request path
- **Cache**: Cloudflare KV (`TENANT_CACHE`) — caches resolved `orgId → connection string` for 5 minutes to avoid a catalog DB round trip per request
- **Analytics/Ops**: PostHog (`posthog-js`) — error tracking, session replay, and a custom conversion funnel on the plot-creation flow, wired to PostHog Self-driving with GitHub issue sync
- **Deployment**: Cloudflare Workers via Wrangler (`npm run deploy` = `vite build && wrangler deploy`)

## Backend Project Details

- **Cloudflare Worker name**: `ardhi-flow` (see `wrangler.jsonc`)
- **Catalog DB URL**: `CATALOG_DATABASE_URL` secret — never hardcode or commit
- **Tenant DB URLs**: never stored directly — each tenant's connection string is AES-GCM encrypted with `TENANT_CONN_ENCRYPTION_KEY` and stored in the catalog's `tenant_projects.encrypted_connection_string` column, decrypted on demand by the tenant-resolver middleware
- **Secrets**: `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`, `CLERK_WEBHOOK_SECRET`, `NEON_API_KEY`, `CATALOG_DATABASE_URL`, `TENANT_CONN_ENCRYPTION_KEY` — set via `wrangler secret put <NAME>` in production, `.dev.vars` locally. Never commit either.

## Key Patterns

- **Hono RPC end-to-end typing**: the Worker exports `AppType = typeof routes`; the client calls `hc<AppType>('/')` from `src/client/lib/api.ts`. A Drizzle table → `drizzle-zod`'s `createInsertSchema` → Hono's `zValidator('json', schema)` → `AppType` → the client call site is one continuous, type-checked chain. Never hand-roll a fetch call to `/api/*` — always go through the typed client.
- **Multi-tenant request flow**: every `/api/*` route (except `/api/webhooks/*` and `/api/health`) passes through `clerkAuth()` (verifies the Clerk session JWT, requires an `org_id` claim) then `tenantResolver()` (resolves `orgId` → tenant Neon connection, via KV cache then the catalog DB, and attaches a scoped Drizzle client as `c.get('tenantDb')`). Routes never touch the catalog DB or raw connection strings directly.
- **Soft deletes everywhere**: tenant-schema tables use an `isDeleted` boolean rather than hard deletes; list/get queries filter `eq(table.isDeleted, false)`, and the DELETE route sets the flag instead of removing the row.
- **File naming is kebab-case, no exceptions** — components, routes, worker files, hooks, lib files (`app-sidebar.tsx`, `tenant-resolver.ts`, `contacts-datagrid.tsx`). This applies even to React components, which is a deliberate deviation from the common PascalCase-file convention.
- **Route gating via pathless layout routes**: `_authed` (must be signed in) wraps `_org` (must have an active Clerk org) in TanStack Router's file-based tree — see `context/architecture.md` for the full route map.

## Known Limitations to Respect (from SCAFFOLD_NOTES.md)

Before "fixing" something that looks incomplete, check `SCAFFOLD_NOTES.md` at the repo root — several gaps are already known and tracked there: no `organization.deleted` webhook handling (orgs can orphan their Neon project), `/api/health` doesn't check real dependencies, no encryption-key rotation strategy, and no abuse protection on the provisioning webhook. (The migration fan-out job for already-provisioned tenants is built — `scripts/migrate-tenants.ts` / `migrate-tenants-pg.ts` — but never run against live infrastructure.)
