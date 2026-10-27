import fs from "node:fs"
import os from "node:os"
import path from "node:path"

// Shared by global setup/teardown and the specs. The saved browser state lives
// in the OS temp dir so a signed in session never lands in the repo.
export const STORAGE_STATE = path.join(os.tmpdir(), "ardhiflow-e2e", "admin.json")
export const E2E_ENABLED = Boolean(process.env.E2E_CLERK_USER_ID)

export function clerkSecretKey(): string {
    if (process.env.CLERK_SECRET_KEY) return process.env.CLERK_SECRET_KEY
    const devVars = fs.readFileSync(path.join(import.meta.dirname, "..", ".dev.vars"), "utf8")
    const line = devVars.split(/\r?\n/).find((l) => l.startsWith("CLERK_SECRET_KEY="))
    if (!line) throw new Error("CLERK_SECRET_KEY is not set and not in .dev.vars")
    return line.slice("CLERK_SECRET_KEY=".length).replace(/^"|"$/g, "")
}

export async function clerkApi<T>(method: string, route: string, body?: unknown): Promise<T> {
    const res = await fetch(`https://api.clerk.com/v1${route}`, {
        method,
        headers: {Authorization: `Bearer ${clerkSecretKey()}`, "content-type": "application/json"},
        body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) throw new Error(`Clerk ${method} ${route} failed: ${res.status} ${await res.text()}`)
    return res.json() as Promise<T>
}
