# packages/shared-schema — cross-app zod + display schemas

## Overview

The single source of truth for data shapes shared between the client and the Worker (and, via `apps/web`, the mobile app). Holds `drizzle-zod` derived schemas so a table definition feeds validation, RPC typing, and UI in one chain.

## Key files

| File | Owns |
|---|---|
| `src/index.ts` | Barrel; currently re-exports exactly 5 modules from `src/types/` |
| `src/types/{commissions,contacts,branding,projects,sms}.ts` | Per-domain schemas (`sms.ts`: the Tanzanian mobile normaliser and the SMS campaign and audience schemas, spec 0004) |

## Conventions

- Consumed as **raw TS source** (`"main": "./src/index.ts"`, no build step), same as `packages/api-client`.
- Depend on `zod` v4 and `drizzle-zod` here; schemas that both the client and Worker need belong in this package, not in `apps/web`.
- Adding a domain means a new file in `src/types/` plus a re-export line in `src/index.ts`.

## Gotchas

- Only 5 domains are exported so far. Plenty of live resources (plots, payments, contracts, message templates) still define their schemas inline in `apps/web`; share a schema here only once mobile actually needs it, to avoid a premature second home for the type.
- Plain Node `tsx` scripts can't import this package's barrel: it loads as CommonJS and the named re-exports come up missing. Vite, vitest and the Worker bundle resolve it fine, so check code that uses it through those.

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
