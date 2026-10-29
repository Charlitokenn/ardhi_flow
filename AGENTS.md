---
description: Rules and context for AI agents building ArdhiFlow
globs: "*"
alwaysApply: true
---

# ArdhiFlow — Agent Configuration

**Build approach:** Tracer Bullet: each feature is proven end to end through the database, API, and UI before the next one starts. (Mirrored from `docs/scope/scope.md`; that file is the source of truth.)

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
- The only code that reaches tenant data without that chain is the NextSMS side of spec 0004: the public delivery webhook, the SMS queue consumers and the SMS cron have no Clerk session, so they open a tenant only through `getTenantDbForOrg()` (`apps/web/src/worker/lib/tenant-db.ts`, the same lookup the middleware uses). The catalog is touched outside that lookup only through the three helpers in `apps/web/src/worker/lib/sms-webhook-keys.ts` (also used by the SMS settings route). Keep both exceptions this narrow.
- Never use hardcoded hex values or arbitrary Tailwind values in client code — always use the CSS variables / mapped Tailwind classes defined in `context/ui-tokens.md`.
- Never install a new library without checking `context/library-docs.md` first — several libraries here (Clerk, Neon, Hono, Tailwind v4) have project-specific integration notes that differ from generic docs.
- Never declare a Drizzle-level foreign key on `plots.activeContractId` — it's intentionally left untyped at the schema level to avoid a circular table-init error; the real FK constraint is added in the generated migration SQL only. Follow the same pattern for any other forward-reference you introduce.
- Update `context/progress-tracker.md` and `context/ui-registry.md` after every completed feature.
- If the same bug persists after one corrective prompt — stop, re-read `SCAFFOLD_NOTES.md` and `context/architecture.md`, and reassess rather than repeating the same fix.
- Before using any third-party library, check `context/library-docs.md` for project-specific notes.
- This project has **no automated tests and no CI/CD** (see `context/code-standards.md`) — typecheck, lint, and build are the verification bar for now. Per workspace (the web app covers both its halves): `pnpm -F @ardhiflow/web build` (runs `tsc -b && vite build`), `pnpm -F @ardhiflow/web lint`, or the whole repo at once via `pnpm lint` / `pnpm build` (Turbo). Run them before considering a change done.

## Tech Stack Quick Reference

- **Frontend**: React 19 SPA built with Vite 8 — no meta-framework, TanStack Router (file-based) handles routing
- **Language**: TypeScript, strict-ish config (`noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`, `erasableSyntaxOnly`)
- **Styling**: Tailwind CSS v4 (CSS-first `@theme inline` config, no `tailwind.config.ts`) + shadcn/ui (style: `radix-mira`, base color `zinc`) + `tw-animate-css`
- **Backend**: Hono 4 running as a single Cloudflare Worker — serves both the `/api/*` routes and the built SPA (Workers Assets, SPA fallback)
- **Auth**: Clerk with Organizations (`@clerk/react`, `@clerk/backend`, `@clerk/ui`) — one Clerk org = one tenant
- **Database**: Postgres via Neon serverless driver + Drizzle ORM, split into two scopes — a single **catalog** project (control plane) and one **tenant** Neon project per org
- **Storage**: Cloudflare R2 for per-tenant file storage, key-prefixed by `tenant.r2Prefix` (binding name is `ardhi_flow_tenant_files` in `apps/web/wrangler.jsonc`)
- **Async work**: Cloudflare Queues (`TENANT_PROVISION_QUEUE`) — Clerk `organization.created` webhook enqueues, a queue consumer does the actual Neon project creation + schema migration off the request path
- **SMS**: NextSMS, one account per tenant (token encrypted in that tenant's `sms_settings` row, never an app wide secret). Campaign sending runs on `SMS_SEND_QUEUE` (dead letter queue `sms-send-dlq`); delivery comes by a public webhook, backed by a 30 minute cron that fans out one sweep per tenant onto `SMS_SWEEP_QUEUE`. See spec 0004 and `context/library-docs.md`.
- **Cache**: Cloudflare KV (`TENANT_CACHE`) — caches resolved `orgId → connection string` for 5 minutes to avoid a catalog DB round trip per request
- **Analytics/Ops**: PostHog (`posthog-js`) — error tracking, session replay, and a custom conversion funnel on the plot-creation flow, wired to PostHog Self-driving with GitHub issue sync
- **Deployment**: Cloudflare Workers via Wrangler, from `apps/web` (`pnpm -F @ardhiflow/web deploy` = `npm run build && wrangler deploy`, where build is `tsc -b && vite build`)

## Commands (monorepo)

- Package manager: pnpm (`packageManager: pnpm@9.15.0`), task runner: Turbo. From the repo root: `pnpm dev`, `pnpm build`, `pnpm lint` fan out across all workspaces; `pnpm dev:web` / `pnpm dev:mobile` / `pnpm dev:marketing` target one app.
- Per workspace commands (Drizzle, seeds, tenant provisioning, deploy) live in each area's own `AGENTS.md` below.

## Backend Project Details

- **Cloudflare Worker name**: `ardhi-flow` (see `wrangler.jsonc`)
- **Catalog DB URL**: `CATALOG_DATABASE_URL` secret — never hardcode or commit
- **Tenant DB URLs**: never stored directly — each tenant's connection string is AES-GCM encrypted with `TENANT_CONN_ENCRYPTION_KEY` and stored in the catalog's `tenant_projects.encrypted_connection_string` column, decrypted on demand by the tenant-resolver middleware
- **Secrets**: `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`, `CLERK_WEBHOOK_SECRET`, `NEON_API_KEY`, `CATALOG_DATABASE_URL`, `TENANT_CONN_ENCRYPTION_KEY` — set via `wrangler secret put <NAME>` in production, `.dev.vars` locally. Never commit either.

## Key Patterns

- **Hono RPC end-to-end typing**: the Worker exports `AppType = typeof routes`; the client calls `hc<AppType>('/')` from `apps/web/src/client/lib/api.ts`. A Drizzle table → `drizzle-zod`'s `createInsertSchema` → Hono's `zValidator('json', schema)` → `AppType` → the client call site is one continuous, type-checked chain. Never hand-roll a fetch call to `/api/*` — always go through the typed client.
- **Multi-tenant request flow**: every `/api/*` route (except `/api/webhooks/*` and `/api/health`) passes through `clerkAuth()` (verifies the Clerk session JWT, requires an `org_id` claim) then `tenantResolver()` (resolves `orgId` → tenant Neon connection, via KV cache then the catalog DB, and attaches a scoped Drizzle client as `c.get('tenantDb')`). Routes never touch the catalog DB or raw connection strings directly.
- **Soft deletes everywhere**: tenant-schema tables use an `isDeleted` boolean rather than hard deletes; list/get queries filter `eq(table.isDeleted, false)`, and the DELETE route sets the flag instead of removing the row.
- **File naming is kebab-case, no exceptions** — components, routes, worker files, hooks, lib files (`app-sidebar.tsx`, `tenant-resolver.ts`, `contacts-datagrid.tsx`). This applies even to React components, which is a deliberate deviation from the common PascalCase-file convention.
- **Route gating via pathless layout routes**: `_authed` (must be signed in) wraps `_org` (must have an active Clerk org) in TanStack Router's file-based tree — see `context/architecture.md` for the full route map.

## Context files

This repo is a pnpm + Turbo monorepo (`apps/*`, `packages/*`). Each area has its own doc; read the one for the area you are editing:

- [apps/web/AGENTS.md](apps/web/AGENTS.md): the main app (React SPA + Hono Worker + Drizzle scopes)
- [apps/desktop/AGENTS.md](apps/desktop/AGENTS.md): Electron shell that loads the web app by URL (`pnpm dev:desktop`, `pnpm compile:desktop`)
- [packages/api-client/AGENTS.md](packages/api-client/AGENTS.md): shared typed Hono RPC client + hooks
- [packages/shared-schema/AGENTS.md](packages/shared-schema/AGENTS.md): cross-app zod schemas
- [apps/marketing/AGENTS.md](apps/marketing/AGENTS.md): Astro marketing site
- [apps/mobile/AGENTS.md](apps/mobile/AGENTS.md): Expo mobile app

## Known Limitations to Respect (from SCAFFOLD_NOTES.md)

Before "fixing" something that looks incomplete, check `SCAFFOLD_NOTES.md` at the repo root — several gaps are already known and tracked there: no `organization.deleted` webhook handling (orgs can orphan their Neon project), `/api/health` doesn't check real dependencies, no encryption-key rotation strategy, and no abuse protection on the provisioning webhook. (The migration fan-out job for already-provisioned tenants is built — `apps/web/scripts/migrate-tenants.ts` / `migrate-tenants-pg.ts` — and was first run against the live tenants on 2026-10-29 to apply `0009_contract_creation`. Run it with `--dry-run` first.)
