import fs from "node:fs"
import {clerkApi, E2E_ENABLED, STORAGE_STATE} from "./clerk-session.ts"

// Revokes the session global setup created and deletes the saved state, so a
// test run never leaves a live Clerk session behind.
export default async function globalTeardown() {
    if (!E2E_ENABLED || !fs.existsSync(STORAGE_STATE)) return

    const state = JSON.parse(fs.readFileSync(STORAGE_STATE, "utf8")) as { cookies: { name: string; value: string }[] }
    const sessionIds = new Set(
        state.cookies
            .filter((cookie) => cookie.name.startsWith("__session"))
            .map((cookie) => JSON.parse(Buffer.from(cookie.value.split(".")[1], "base64url").toString()).sid as string),
    )
    for (const id of sessionIds) await clerkApi("POST", `/sessions/${id}/revoke`)
    fs.rmSync(STORAGE_STATE)
}
