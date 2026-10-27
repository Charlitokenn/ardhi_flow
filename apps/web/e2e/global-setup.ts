import fs from "node:fs"
import path from "node:path"
import {chromium, type FullConfig} from "@playwright/test"
import {clerkApi, E2E_ENABLED, STORAGE_STATE} from "./clerk-session.ts"

type ClerkInPage = {
    loaded: boolean
    client: { signIn: { create: (p: { strategy: "ticket"; ticket: string }) => Promise<{ createdSessionId: string }> } }
    setActive: (p: { session: string; organization?: string }) => Promise<void>
    organization?: { id: string } | null
}

// Signs the E2E user in once with a short lived Clerk sign in ticket and
// saves the browser state for every spec. Skipped when E2E is not enabled.
export default async function globalSetup(config: FullConfig) {
    if (!E2E_ENABLED) return

    const {token} = await clerkApi<{ token: string }>("POST", "/sign_in_tokens", {
        user_id: process.env.E2E_CLERK_USER_ID,
        expires_in_seconds: 600,
    })

    const baseURL = config.projects[0].use.baseURL
    const browser = await chromium.launch()
    const page = await browser.newPage()
    await page.goto(`${baseURL}/`)
    await page.waitForFunction(() => (window as unknown as { Clerk?: ClerkInPage }).Clerk?.loaded)
    await page.evaluate(async ({ticket, orgId}) => {
        const clerk = (window as unknown as { Clerk: ClerkInPage }).Clerk
        const signIn = await clerk.client.signIn.create({strategy: "ticket", ticket})
        await clerk.setActive({session: signIn.createdSessionId, organization: orgId})
        if (!clerk.organization) throw new Error("E2E user has no active organization")
    }, {ticket: token, orgId: process.env.E2E_CLERK_ORG_ID})

    fs.mkdirSync(path.dirname(STORAGE_STATE), {recursive: true})
    await page.context().storageState({path: STORAGE_STATE})
    await browser.close()
}
