import path from "path"
import {defineConfig} from "vitest/config"
import react from "@vitejs/plugin-react"
import svgr from "vite-plugin-svgr"

// Kept apart from vite.config.ts on purpose: a vitest.config file replaces the
// Vite config for tests, so the Cloudflare (Miniflare) and TanStack Router
// plugins never run under Vitest. Only what the code under test needs:
// JSX, `?react` SVG imports, and the `@/` alias.
//
// Default environment is node (worker routes). Component tests opt into the
// DOM with a `// @vitest-environment jsdom` comment at the top of the file.
export default defineConfig({
    plugins: [react(), svgr()],
    resolve: {
        alias: {
            "@": path.resolve(import.meta.dirname, "./src/client"),
        },
    },
    test: {
        include: ["src/**/*.test.{ts,tsx}"],
        setupFiles: ["./src/client/test/setup.ts"],
        restoreMocks: true,
    },
})
