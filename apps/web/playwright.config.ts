import {defineConfig, devices} from "@playwright/test"

// End to end flows against the real dev server (React app + Worker on one
// Vite port) and a real tenant database. They need a signed in Clerk user:
// set E2E_CLERK_USER_ID (an org admin of a seeded tenant) and keep
// CLERK_SECRET_KEY in .dev.vars. Without E2E_CLERK_USER_ID every spec skips.
export default defineConfig({
    testDir: "./e2e",
    fullyParallel: false,
    workers: 1,
    reporter: "line",
    globalSetup: "./e2e/global-setup.ts",
    globalTeardown: "./e2e/global-teardown.ts",
    use: {
        baseURL: "http://localhost:5199",
        timezoneId: "Africa/Dar_es_Salaam",
        trace: "retain-on-failure",
    },
    projects: [
        {name: "desktop", use: {...devices["Desktop Chrome"], viewport: {width: 1280, height: 900}}},
    ],
    webServer: {
        command: "pnpm exec vite --port 5199 --strictPort",
        url: "http://localhost:5199/api/health",
        reuseExistingServer: true,
        timeout: 120_000,
    },
})
