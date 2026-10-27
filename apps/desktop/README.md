# ArdhiFlow Desktop

Electron desktop client for ArdhiFlow. It opens the ArdhiFlow web app (`apps/web`) in a hardened Electron window.

```bash
pnpm dev:web       # start the web app first
pnpm dev:desktop   # then launch the desktop shell against it

VITE_WEB_APP_URL=https://<deployed web app> pnpm compile:desktop
```

See [AGENTS.md](./AGENTS.md) for the package layout, environment variables and known limitations.

Based on [vite-electron-builder](https://github.com/cawa-93/vite-electron-builder) by Alex Kozack (MIT, see [LICENSE](./LICENSE)).
