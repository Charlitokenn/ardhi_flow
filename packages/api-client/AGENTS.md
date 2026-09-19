# packages/api-client — shared Hono RPC client + client hooks

## Overview

The cross-app API client layer. Exposes `createApiClient<AppType>(baseUrl, getToken, onUnauthorized)` and a set of shared React hooks, so `apps/web` and `apps/mobile` call the same typed Hono endpoints through one factory.

## Key files

| File | Owns |
|---|---|
| `src/create-client.ts` | `createApiClient` — builds an `hc<AppType>` with a Bearer token injected per request and a 401 hook |
| `src/hooks/` | Shared client hooks (`use-mobile`, `use-tenant-presence`, `use-table-csv-export`, …) |
| `src/index.ts` | The public barrel (hooks + `create-client`) |

## Conventions

- Consumed as **raw TS source** (`"main": "./src/index.ts"`, no build step) — apps' bundlers compile it directly. Do not add a build script without checking consumers.
- The package is **generic over `AppType`**: it never imports the Worker (that would be circular, since `apps/web` depends on this package). Callers pass their own `AppType`.
- `onUnauthorized` is a callback, not a redirect: this package is shared with `apps/mobile`, which has no `window` and its own navigation. Keep platform behavior out of here.
- 401 here means missing/invalid/expired session; 403 means valid session, no active org. Only 401 fires `onUnauthorized`.

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
