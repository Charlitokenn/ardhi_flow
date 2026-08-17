# ArdhiFlow — Code Standards

## Language & Typing

- Language: **TypeScript** throughout (client, worker, scripts, drizzle config)
- Strict-leaning tsconfig: `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax` (type-only imports must use `import type`), `erasableSyntaxOnly`, `noFallthroughCasesInSwitch`. There's no explicit `strict: true`/`noImplicitAny` flag set, but write as if there were — don't introduce `any`.
- Use `import type { X } from '...'` for anything that's type-only — required by `verbatimModuleSyntax`, and it's how the client keeps worker-only runtime code (Drizzle, Neon, Clerk backend SDK) out of the browser bundle (see the comment at the top of `src/client/lib/api.ts`).
- **Server-side** validation schemas are generated from Drizzle tables via `drizzle-zod`'s `createInsertSchema(table)`, not hand-written Zod schemas — keep this pattern for any new table/route so the schema, the DB, and the API validator can never drift from each other.
- **Client-side**, complex multi-step forms now use hand-written `zod` object schemas per step (see `add-edit-contact-form.tsx` — `contactInfoSchema`, `addressSchema`, `emergencySchema`) for fast-fail UX validation. These are intentionally separate, hand-written schemas, not imported from the server's `drizzle-zod` schemas — the client and worker packages aren't sharing a schema module today, so keep both in sync by hand when a validated field's rules change on one side. See `ui-rules.md` → Forms for when to reach for this pattern vs. a plain single-step form.
- Prefer `type` for object shapes; Drizzle's own `$inferSelect`/`$inferInsert` type exports (see bottom of `drizzle/tenant/schema.ts`) are the source of truth for a table's row shape — import those rather than redefining an interface.

## File & Folder Naming

| Artefact | Convention | Example |
|----------|-----------|---------|
| Components (client) | **kebab-case**, even for React components | `app-sidebar.tsx`, `contacts-datagrid.tsx`, `network-status-banner.tsx` |
| Routes (TanStack Router file-based) | kebab-case, framework-dictated structure | `sign-in.$.tsx`, `_authed/_org/finance/reconciliation.tsx` |
| Worker routes | kebab-case, one file per resource | `plots.ts`, `webhooks/clerk.ts` |
| Hooks | `use-` prefix, kebab-case | `use-mobile.ts`, `use-copy-to-clipboard.ts` |
| Lib/utility files | kebab-case | `export-csv.ts`, `table-filters.ts`, `tenant-migrations.ts` |
| Drizzle enums | `SCREAMING_SNAKE_CASE` constants, singular | `CONTRACT_STATUS_ENUM`, `EXPENSE_CATEGORY` |
| Drizzle tables/columns | camelCase in TS, snake_case in Postgres (via explicit column name string) | `clientContactId` → `'client_contact_id'` |

This project deliberately uses kebab-case for component filenames rather than the more common PascalCase-for-components convention — follow the existing pattern rather than "fixing" it on new files.

## Component Structure

```tsx
// Typical client route component (see routes/_authed/_org/projects/plots.tsx)
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'
import { apiClient } from '@/lib/api.ts'

export const Route = createFileRoute('/_authed/_org/projects/plots')({
  staticData: { breadcrumb: 'Plots' },
  component: PlotsPage,
})

function PlotsPage() {
  const { getToken } = useAuth()
  const api = apiClient(getToken)
  const query = useQuery({ queryKey: ['plots'], queryFn: async () => { /* ... */ } })
  // mutations, then JSX last
  return (/* ... */)
}
```

- Every route file exports a `Route` via `createFileRoute(path)`, with a `staticData.breadcrumb` string and a `component`.
- Don't add `'use client'` directives to hand-written files — this is a plain Vite SPA, every component is a client component by definition. **Exception**: components pulled in from an external shadcn-compatible registry (`@reui`, `@billingsdk`, etc.) sometimes arrive with a stray `"use client"` at the top (e.g. `reui/phone-input.tsx`) — it's a harmless no-op here; leave it in registry-sourced files so future `npx shadcn add` updates don't produce a spurious diff, but never add one yourself in code you write from scratch.

## Imports

- Use the `@/*` path alias (mapped to `src/client/*` in `tsconfig.app.json`) for any cross-feature client import — never `../../../components/...`.
- Worker code imports Drizzle schemas via relative paths from `src/worker/*` up to `drizzle/tenant/schema.ts` / `drizzle/catalog/schema.ts` (there's no path alias for the worker side) — e.g. `import { plots } from '../../../drizzle/tenant/schema'`.
- No barrel `index.ts` re-export files are used for components — import directly from the source file (`@/components/data-grids/plots-datagrid.tsx`, not a barrel).

## Data Fetching (client)

- All API calls go through `apiClient(getToken)` (`src/client/lib/api.ts`), which is a `hc<AppType>()` Hono RPC client with the Clerk session token attached as a Bearer header on every request.
- Reads: `useQuery` with a queryKey array matching the resource (`['plots']`, `['contacts', id]`).
- Writes: `useMutation` calling the typed client method (`api.api.plots.$post({ json: input })`), checking `res.ok` and throwing on failure, then `queryClient.invalidateQueries` on success rather than manually writing to the cache.
- Capture a PostHog event on the mutation's success and error paths for anything that represents a meaningful business action (see `plot_created` / `plot_creation_failed`) — this feeds the existing PostHog Self-driving conversion funnel.

## Data Fetching (worker / API routes)

- Each resource gets its own Hono sub-app in `src/worker/routes/<resource>.ts`, chained with `.get()/.post()/.patch()/.delete()`, exported as a default and mounted in `src/worker/index.ts` via `.route('/resource', resourceRoute)`.
- Validate every mutating request body with `zValidator('json', createInsertSchema(table).omit({...}))` — see `plots.ts` for the canonical shape (omit `id`, `createdAt`, `updatedAt` on insert; `.partial()` the same schema for PATCH).
- List/get queries filter soft-deleted rows explicitly (`eq(table.isDeleted, false)`) — there's no DB-level enforcement of this, so it must be added by hand in every new query. Don't forget it.
- Access the tenant DB only via `c.get('tenantDb')` (populated by `tenantResolver()` middleware) — never open a Neon connection directly inside a route handler.
- Return `c.json({ error: '...' }, statusCode)` for error paths (404 for not-found, 409 for state conflicts like an inactive tenant) — keep this shape consistent so the client's error handling stays simple.

## Error Handling

- Worker: return typed JSON error bodies with an appropriate HTTP status, as above. There's no global Hono error boundary/`onError` handler configured yet — if you add one, document it here.
- Client: mutations check `res.ok` and `throw new Error(...)` on failure inside `mutationFn`; surface errors via the mutation's `isError`/`error` state in the UI (see `plots.tsx`), and consider a `sonner` toast for user-facing failures.
- Queue consumer (`provision-tenant.ts`): any thrown error causes Cloudflare Queues to redeliver the whole message — provisioning steps must stay idempotent (see the `findProjectByName` guard in `neon-api.ts`) rather than assuming "it'll just retry cleanly."

## State Management

- No global client state library (Redux/Zustand/etc.) — server state lives in TanStack Query's cache; local UI-only state is plain `useState`.
- Auth/org state comes from Clerk's own hooks (`useAuth`, `useOrganization`) and is bridged into the router's `beforeLoad` context via `RouterAuthContext` (see `router.tsx`) rather than duplicated into app state.

## Performance

- No explicit `next/image`-equivalent — this is a plain Vite SPA, use standard `<img>` with real `alt` text; there's no image optimization pipeline configured.
- TanStack Query's default `staleTime` is set to 30s globally (`router.tsx`) — don't override per-query unless a specific resource genuinely needs fresher or staler data.
- `@tanstack/react-virtual` is a dependency — reach for it if a list/table grows large enough to need virtualization rather than rendering everything.

## Testing

**No automated tests exist in this project, and none are configured** (no Vitest, no Playwright, no test script in `package.json`). `SCAFFOLD_NOTES.md` explicitly flags this as a known gap, not an oversight to silently "fix" by inventing a test framework choice — if Charles wants tests added, that's a decision to make explicitly, not to infer.

## Git / Commits

- No enforced commit message format observed in history — write clear, present-tense, scoped messages (e.g. `finance: add reconciliation view`) consistent with the repo's existing style.
- Never commit `.dev.vars`, `.env`, `node_modules`, `dist`, or `src/client/routeTree.gen.ts` changes made outside of the router plugin's own generation.

## Linting & Formatting

- Linter: **ESLint 10** flat config (`eslint.config.js`) — `@eslint/js` recommended + `typescript-eslint` recommended + `eslint-plugin-react-hooks` + `eslint-plugin-react-refresh`. `react-refresh/only-export-components` is deliberately disabled for `main.tsx` and every file under `routes/**` (TanStack Router's file-route convention exports more than just the component, which the rule can't model — this is intentional, don't re-enable it project-wide).
- No Prettier or other formatter is configured — match the existing formatting style in the file you're editing (this codebase mixes single/double quotes and tab/space indent between the original Vite scaffold files and newer worker/domain code; don't do a blanket reformat).
- Run `npx tsc -b && npx eslint .` before considering any change done — this is the actual verification bar used when this codebase was built (see `SCAFFOLD_NOTES.md`), since there are no automated tests.
