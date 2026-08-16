# ArdhiFlow — Library-Specific Notes

> Before using any library, read its section here for project-specific constraints.
> Then consult the library's own docs for full API details.
>
> **Verified against official docs**: 2026-08-16

---

## Hono 4 + Cloudflare Workers

- This Worker exports a combined `{ fetch, queue }` handler (`satisfies ExportedHandler<Env, ProvisionTenantMessage>`) — both the HTTP API and the queue consumer live in the same Worker/deploy. This matches Hono's and Cloudflare's current recommended pattern for a Worker that needs both.
- **RPC pattern**: routes are chained with `.route()` calls (`const routes = app.route('/api', authed)`), and `AppType = typeof routes` is exported — not `typeof app`. Only the *chained* export carries full route-shape inference for the client's `hc<AppType>()`. If you add a new route group, chain it the same way rather than mounting it separately, or the client won't see its types.
- Middleware order matters and is enforced today as `clerkAuth()` → `tenantResolver()` on every authed sub-route — don't reorder these; `tenantResolver()` reads `c.get('orgId')`, which only exists after `clerkAuth()` runs.

---

## Clerk (Organizations) — `@clerk/react`, `@clerk/backend`, `@clerk/ui`

- **Networkless JWT verification on Workers**: `CLERK_JWT_KEY` (Dashboard → API Keys → PEM Public Key) is passed alongside `secretKey` to `verifyToken()`/`authenticateRequest()` specifically so verification happens without a network round-trip to Clerk's Backend API — required for good latency on Cloudflare's V8 isolate runtime. If `jwtKey` is omitted, Clerk falls back to a live JWKS fetch, which is slower and adds an external dependency to every authed request. This is already wired correctly in `middleware/clerk-auth.ts` — don't remove the `jwtKey` option when touching this file.
- The session token must be customized in the Clerk dashboard (Sessions → Edit) to include `org_id`, `org_role`, and `org_slug` claims — without this, `clerkAuth()` has no `org_id` to key tenant resolution on. This is a dashboard-side config step, not something fixable in code.
- A webhook endpoint for `organization.created` must be registered in the Clerk dashboard pointing at `/api/webhooks/clerk` — this is what triggers tenant provisioning. `organization.deleted` is **not** currently handled (see `SCAFFOLD_NOTES.md`); an org deleted in Clerk today orphans its Neon project and catalog row.
- Client-side: `useAuth()` (`isSignedIn`, `orgId`, `getToken`) and `useOrganization()` are the primitives in use — `getToken()` is threaded into `apiClient()` to attach a Bearer token to every RPC call. `@clerk/ui`'s `shadcn` theme preset is used so Clerk's own components (sign-in, sign-up, org switcher) match the app's design tokens automatically.

---

## Cloudflare Queues (`TENANT_PROVISION_QUEUE`)

- **Per-message explicit acknowledgment is already correctly used**: `handleTenantProvisionQueue` calls `message.ack()` on success (including the "already provisioned, needs manual reconciliation" branch) and `message.retry()` on failure, for each message individually inside the batch loop — this is Cloudflare's current recommended pattern and avoids redelivering the *entire batch* when only one message fails (the older/simpler behavior, where any thrown error inside `queue()` fails the whole batch, only applies if you don't call per-message `ack()`/`retry()`).
- Cloudflare Queues guarantees **at-least-once** delivery, never exactly-once — a message can be redelivered even after successful processing (e.g. an ack that doesn't land before a crash). Every consumer must be idempotent by design, not as an afterthought.
- This is exactly why `findProjectByName()` is called before creating a Neon project: Neon's project-creation endpoint is a `POST` and is explicitly not safe to blindly retry, so redelivery after a partial success (project created, catalog write not yet done) would otherwise spawn a duplicate orphaned Neon project. The current fix stops duplication but does **not** self-heal — a conflict is logged and the tenant stays unprovisioned until a human reconciles via `scripts/provision-tenant.ts` or the Neon console.
- `wrangler.jsonc` configures `max_batch_size: 5`, `max_retries: 3`, and a `tenant-provisioning-dlq` dead-letter queue — after 3 retries a permanently-failing message lands in the DLQ rather than retrying forever.

---

## Tailwind CSS v4 + shadcn/ui

- **No `tailwind.config.ts` exists or is needed** — Tailwind v4 uses CSS-first configuration via `@theme` blocks directly in `index.css`. Don't create a JS/TS config file; add new design tokens as CSS custom properties + a `@theme inline` alias instead (see `ui-tokens.md`).
- shadcn/ui style in use is **`radix-mira`** (`components.json`) — a newer registry style alongside the more common `new-york-v4`. It has at least one known upstream issue as of early 2026: `CommandDialog` in this style doesn't wrap its children in `<Command>`, which throws at runtime if you use `CommandInput` inside a `CommandDialog` without patching it locally. If you add command-palette-style UI, check for this before assuming a crash is your own bug.
- Three registries are configured (`components.json` → `registries`): the default shadcn registry, `@diceui` (diceui.com), and `@reui` (reui.io). `npx shadcn add <name>` resolves against whichever registry the component's namespace points to — check `ui-registry.md` first so you don't rebuild something already pullable.
- Icon library is locked to `lucide-react` project-wide (`iconLibrary: "lucide"`) — don't introduce a second icon set.

---

## Neon (serverless Postgres) + Drizzle ORM

- This project uses `drizzle-orm/neon-http` (via `@neondatabase/serverless`'s `neon()` HTTP client), not `drizzle-orm/neon-serverless` (WebSocket-based `Pool`/`Client`). HTTP is the right choice here because the Worker only ever needs single, non-interactive queries per request — no multi-statement session transactions. If a future feature genuinely needs an interactive transaction across multiple queries, that requires switching to the WebSocket driver for that code path, not assuming `neon-http` supports it silently.
- **Project-per-tenant, not schema-per-tenant or row-level multi-tenancy**: every org gets a dedicated Neon *project* (`tenant-{orgId}`), created via the Neon Management API (`lib/neon-api.ts`, keyed by `NEON_API_KEY`). The catalog DB is itself just another Neon project — the "control plane."
- Drizzle Kit config is intentionally split into two files — `drizzle.catalog.config.ts` and `drizzle.tenant.config.ts` — with matching npm scripts (`db:generate:catalog`, `db:migrate:catalog`, `db:generate:tenant`). Always generate/migrate against the correct config for the schema you're actually changing; running the wrong one is a common mistake with a two-schema setup like this.
- `drizzle-zod`'s `createInsertSchema(table)` is the only source of request-body validation schemas (see any file in `src/worker/routes/`) — never hand-write a parallel Zod schema for a table that already has a Drizzle definition; it will drift.
- Note the two schema-generation script names in `package.json`: `db:generate:tenant` passes `--name=init` (there's only ever one canonical tenant migration set generated fresh per schema change, applied to every tenant), whereas `db:generate:catalog` does not.

---

## TanStack Router (file-based) + TanStack Query

- File-based routing via `@tanstack/router-plugin`'s Vite plugin — the route tree is auto-generated into `src/client/routeTree.gen.ts`. Never hand-edit that file; add/remove files under `src/client/routes/` instead and let the plugin regenerate it.
- Pathless layout routes (prefixed with `_`, e.g. `_authed`, `_org`) are used for auth/org gating without adding a URL segment — `_authed` requires a signed-in Clerk session, `_org` (nested inside it) requires an active Clerk organization and renders the sidebar shell. Any new authenticated page goes under `_authed/_org/`.
- `RouterAuthContext` (`isSignedIn`, `orgId`, `getToken`) is threaded into the router via the `context` prop on `<RouterProvider>` in `main.tsx`, only after Clerk's `useAuth().isLoaded` resolves — route `beforeLoad` guards can rely on this context being fully resolved, never `undefined`, by the time they run.
- TanStack Query's `staleTime` defaults to 30s globally (`router.tsx`) — don't override per-query without a specific reason.

---

## PostHog (`posthog-js`)

- PostHog Self-driving is configured for this project (GitHub App integration, org-level AI data processing consent granted) with error tracking (`capture_exceptions: true`), a custom conversion funnel on the plot-creation flow, and GitHub Issues sync for `Charlitokenn/ardhi_flow`. Session replay and Support/Conversations were flagged as needing server-side toggle verification in the PostHog dashboard as of the last setup run — check `posthog-self-driving-report.md` at the repo root before assuming those are live.
- Client init is in `src/client/routes/__root.tsx`. Capture meaningful business events (`plot_created`, `plot_creation_failed`, etc.) via `usePostHog()`'s `capture()` on mutation success/error paths — this is what feeds the conversion-funnel monitoring, not a nice-to-have.

---

## Version Lock

| Library | Locked Version | Reason |
|---------|---------------|--------|
| React | ^19.2.8 | Whole app assumes React 19 semantics (no legacy `use client` concerns since this is a plain SPA, but React 19-specific APIs may be used going forward) |
| Tailwind CSS | ^4.3.3 | v4's CSS-first config is structurally different from v3 — do not follow v3-era tutorials/config patterns |
| drizzle-orm | ^0.45.2 | `uniqueIndex().where()` (used for the "one active contract per plot" constraint) requires drizzle-orm >= 0.31 — don't downgrade below that |
| Hono | ^4.13.1 | RPC chaining pattern (`AppType = typeof routes`) verified against this major version's docs |
| wrangler | ^4.120.0 | `compatibility_date: "2026-08-01"` in `wrangler.jsonc` is pinned deliberately — bumping it can change Workers runtime behavior; treat as a considered decision, not a routine update |
