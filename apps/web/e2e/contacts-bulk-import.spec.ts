import {expect, type Page, test} from "@playwright/test"
import {E2E_ENABLED, STORAGE_STATE} from "./clerk-session.ts"

// The contacts page's CSV bulk import, end to end: real uploader, real
// POST /api/contacts/bulk, real tenant database (spec 0005).

test.skip(!E2E_ENABLED, "Set E2E_CLERK_USER_ID to run browser flows against a signed in tenant")
test.use({storageState: STORAGE_STATE})

const PREFIX = `E2E Import ${Date.now()}`
const mobile = (n: number) => `+2557${String(Date.now() + n).slice(-8)}`

type ClerkInPage = { session: { getToken: () => Promise<string | null> } }

// Soft deletes every contact this spec created, through the app's own API.
async function deleteContactsNamed(page: Page, prefix: string) {
    await page.evaluate(async (namePrefix) => {
        const token = await (window as unknown as { Clerk: ClerkInPage }).Clerk.session.getToken()
        const headers = {Authorization: `Bearer ${token}`}
        const all: { id: string; fullName: string }[] = await (await fetch("/api/contacts", {headers})).json()
        for (const contact of all.filter((c) => c.fullName.startsWith(namePrefix))) {
            await fetch(`/api/contacts/${contact.id}`, {method: "DELETE", headers})
        }
    }, prefix)
}

async function openUploader(page: Page) {
    await page.getByRole("button", {name: "New Contact"}).locator("xpath=following::button[1]").click()
    await expect(page.getByRole("dialog")).toBeVisible()
}

test.beforeEach(async ({page}) => {
    await page.goto("/contacts")
    // The first visit on a cold dev server compiles the route on demand.
    await expect(page.getByRole("heading", {name: "Contacts"})).toBeVisible({timeout: 30_000})
})

test.afterEach(async ({page}) => {
    await deleteContactsNamed(page, PREFIX)
})

test("imports the valid rows, fails only the blank mobile row, and shows them in the grid without a reload (0005 AC-1, AC-4, AC-5)", async ({page}) => {
    const csv = [
        "Full Name,Mobile,Contact Type",
        `${PREFIX} One,${mobile(1)},CLIENT`,
        `${PREFIX} Blank Mobile,,CLIENT`,
        `${PREFIX} Two,${mobile(2)},SURVEYOR`,
    ].join("\n")

    await openUploader(page)
    await page.locator('input[type="file"]').setInputFiles({name: "contacts.csv", mimeType: "text/csv", buffer: Buffer.from(csv)})
    await page.getByRole("button", {name: "Continue"}).click()
    await page.getByRole("button", {name: "Confirm & Upload"}).click()

    await expect(page.getByRole("heading", {name: "Import results"})).toBeVisible()
    await expect(page.getByText("Created: 2")).toBeVisible()
    await expect(page.getByText("Failed: 1")).toBeVisible()
    await expect(page.getByRole("row", {name: /^2\s*failed\s*mobileNumber:/i})).toBeVisible()

    await page.keyboard.press("Escape")
    await page.getByPlaceholder("Search contacts...").fill(PREFIX)
    await expect(page.getByText(`${PREFIX} One`)).toBeVisible()
    await expect(page.getByText(`${PREFIX} Two`)).toBeVisible()
    await expect(page.getByText(`${PREFIX} Blank Mobile`)).toHaveCount(0)
})

test("refuses a file that is not a CSV and imports nothing", async ({page}) => {
    await openUploader(page)
    await page.locator('input[type="file"]').setInputFiles({name: "contacts.txt", mimeType: "text/plain", buffer: Buffer.from("hello")})

    await expect(page.getByText("Only CSV files are supported.")).toBeVisible()
    await expect(page.getByRole("button", {name: "Continue"})).toHaveCount(0)
})
