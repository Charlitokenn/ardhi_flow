# apps/desktop — Electron shell (vendored, not yet integrated)

## Overview

A vendored copy of the `secure-electron-template` (Alex Kozack) boilerplate, v3.1.0, dropped in as a starting point for a future desktop client. It is **not** an ArdhiFlow product yet and **not** wired into the monorepo build. Treat its code as upstream scaffold, not project code.

## State (as of 2026-09, branch `implement-monorepo`)

- Standalone island: `apps/desktop/package.json` declares its own npm `"workspaces": ["packages/*"]` and `engines.node >= 23.0.0`, and all its scripts use `npm -ws`. It is absent from `pnpm-lock.yaml` importers and has no installed `node_modules`.
- Its package name is literally `"root"` (not `@ardhiflow/desktop`), so `pnpm -F @ardhiflow/desktop …` will never match it.
- It does not import `@ardhiflow/api-client`, `@ardhiflow/shared-schema`, or `@ardhiflow/web` yet. No ArdhiFlow-specific code is written here.
- Turbo sees it as a workspace member but its scripts will fail under pnpm; do not run `turbo build` expecting it to participate.

## Key files

| File | Owns |
|---|---|
| `packages/entry-point.mjs` | Electron `main` entry |
| `packages/{main,preload,integrate-renderer}` | Template's own npm workspaces |
| `electron-builder.mjs` | Packaging/dist config |
| `tests/e2e.spec.ts` | A single Playwright smoke test |
| `buildResources/` | App icons only (`icon.icns`, `icon.png`) |

## Commands

```bash
# From inside apps/desktop, with npm (NOT pnpm) — scaffold defaults
npm run init       # create + integrate a renderer
npm run start      # dev
npm run compile    # build + package via electron-builder
```

## Gotchas

- Before building on this, decide the integration: rename the package, fold it into pnpm/turbo, then point a renderer at the `@ardhiflow/web` SPA. Until then, keep changes minimal so the template can still be diffed against upstream.
- Its README is the template author's, with a support-Ukraine notice; that is upstream text, not project copy.

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
