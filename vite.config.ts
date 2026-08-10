import path from "path"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

// https://vite.dev/config/
export default defineConfig({
  // `cloudflare()` reads wrangler.jsonc and runs src/worker/index.ts inside
  // the real Workers runtime (via Miniflare) as part of the same dev server
  // as the React app — no separate `wrangler dev` process needed, and
  // `vite build` produces both the client assets and the Worker bundle.
  //
  // `tanstackRouter()` must run before the react plugin (its own
  // requirement) — it generates src/client/routeTree.gen.ts from the files
  // under routesDirectory on every change.
  plugins: [
    tanstackRouter({
      routesDirectory: './src/client/routes',
      generatedRouteTree: './src/client/routeTree.gen.ts',
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
    cloudflare(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src/client"),
    },
  },
})
