# apps/desktop — Electron shell around the web app

## Overview

An Electron desktop client that opens the ArdhiFlow web app (`apps/web`) in a hardened window. It has no UI of its own: the renderer **is** the web app, loaded by URL. Built on the `vite-electron-builder` template by Alex Kozack (v3.1.0, MIT; see `LICENSE`), adapted to this pnpm + Turbo monorepo.

Why a URL and not a bundled copy of the SPA: the SPA calls `/api/*` on its own origin (the Worker) and Clerk needs a real http(s) origin. Neither works from `file://`.

## Packages

| Package | Path | Owns |
|---|---|---|
| `@ardhiflow/desktop` | `.` | Electron `main` entry (`packages/entry-point.mjs`), dev runner, packaging (`electron-builder.mjs`), e2e test |
| `@ardhiflow/desktop-main` | `packages/main` | Main process: window, single instance, auto-updater, navigation/security rules |
| `@ardhiflow/desktop-preload` | `packages/preload` | Preload script; everything exported from `src/index.ts` is exposed to the page via `contextBridge` |
| `@ardhiflow/electron-versions` | `packages/electron-versions` | Build helper: reads the bundled Chrome/Node versions to set Vite build targets |

`apps/desktop/packages/*` is listed in `pnpm-workspace.yaml`. `main` and `preload` build with `tsc --noEmit && vite build`, so they join `pnpm build` (Turbo).

## Commands

```bash
pnpm dev:web          # 1. start the web app (Vite on :5173)
pnpm dev:desktop      # 2. build main/preload in watch mode and launch Electron against it
pnpm build            # typechecks + builds main/preload with the rest of the repo

VITE_WEB_APP_URL=https://<deployed web app> pnpm compile:desktop   # package an installer into apps/desktop/dist
```

## Environment

| Variable | When | Purpose |
|---|---|---|
| `VITE_WEB_APP_URL` | build time, **required for `compile`** | Deployed web app URL the packaged window loads. A plain `pnpm build` falls back to `http://localhost:5173/`; `electron-builder.mjs` refuses to package without it. |
| `VITE_EXTRA_ALLOWED_ORIGINS` | build time, optional | Comma-separated extra origins the window may navigate to (e.g. Clerk hosted pages for OAuth). |
| `ARDHIFLOW_WEB_DEV_URL` | dev only | Override the dev server URL if the web app isn't on `http://localhost:5173/`. |
| `VITE_DISTRIBUTION_CHANNEL` | build time, optional | Auto-updater channel. |

## Gotchas

- Navigation is blocked to any origin except the web app's own plus `VITE_EXTRA_ALLOWED_ORIGINS` (`BlockNotAllowdOrigins.ts`), and `window.open` to any origin is denied (`ExternalUrls.ts`, empty allowlist). **Clerk OAuth (social sign-in) redirects off-origin and will be blocked** until its origins are allowed. Email/password sign-in stays on-origin and works.
- Auto-update has no publish target configured yet (`electron-builder.mjs` has no `publish`), so `AutoUpdater` finds no releases and exits quietly. Configure it before shipping.
- No code signing is configured; Windows/macOS installers will be unsigned.
- On Windows, `compile` needs symlink rights (Developer Mode on, or an elevated shell): electron-builder unpacks its `winCodeSign` tools, which contain symlinks, and otherwise fails with "A required privilege is not held by the client". `-c.win.signAndEditExecutable=false` skips that step, but then the exe keeps Electron's default icon and version info.
- `apps/desktop/dist/` is the installer output (gitignored), not a Turbo build output; Turbo caches only the `dist/` of `main` and `preload`.
- `tests/e2e.spec.ts` runs against a packaged build (`compile` first). It is not part of any automated run.
- `engines.node >= 23` comes from the template (the main/preload builds use `import.meta.resolve` and JSON import attributes).
