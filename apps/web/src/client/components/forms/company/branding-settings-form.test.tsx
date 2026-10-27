// @vitest-environment jsdom
import {beforeEach, describe, expect, it, vi} from "vitest"
import {render, screen} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {QueryClient, QueryClientProvider} from "@tanstack/react-query"
import {toast} from "sonner"
import {BrandingSettingsForm} from "./branding-settings-form.tsx"

// Boundaries only: Clerk (org identity + token) and the network.
vi.mock("@clerk/react", () => ({
    useAuth: () => ({getToken: async () => "session-token"}),
    useOrganization: () => ({organization: {name: "TAJ Homes", imageUrl: "https://img.clerk.com/taj.png"}}),
}))
vi.mock("sonner", () => ({toast: Object.assign(vi.fn(), {error: vi.fn()})}))

const SAVED = {
    slogan: "Your Trusted Land Partner",
    primaryColor: "#0F6B3D",
    email: "info@ardhiflow.co.tz",
    mobileNumber: "+255754000000",
    address: "Kigamboni, Dar es Salaam",
    website: "https://ardhiflow.co.tz",
    signerTitle: "Managing Director",
}

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {status, headers: {"content-type": "application/json"}})

let fetchMock: ReturnType<typeof vi.fn>

function stubApi({get = () => json(SAVED), put = (body: unknown) => json(body)}: {
    get?: () => Response
    put?: (body: unknown) => Response
} = {}) {
    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const method = init?.method ?? "GET"
        if (String(input).endsWith("/api/company-settings") && method === "GET") return get()
        if (String(input).endsWith("/api/company-settings") && method === "PUT") return put(JSON.parse(String(init?.body)))
        throw new Error(`Unexpected request ${method} ${String(input)}`)
    })
    vi.stubGlobal("fetch", fetchMock)
}

const putCalls = () => fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT")

function renderForm() {
    const client = new QueryClient({defaultOptions: {queries: {retry: false}}})
    const user = userEvent.setup()
    render(
        <QueryClientProvider client={client}>
            <BrandingSettingsForm/>
        </QueryClientProvider>,
    )
    return {user}
}

describe("BrandingSettingsForm", () => {
    beforeEach(() => {
        vi.unstubAllGlobals()
    })

    it("shows the org name and logo from Clerk, read only, next to the editable fields (0001 AC-1)", async () => {
        stubApi()
        renderForm()

        expect(await screen.findByText("TAJ Homes")).toBeInTheDocument()
        expect(screen.getByText("Company name and logo are managed under General.")).toBeInTheDocument()
        expect(screen.queryByRole("textbox", {name: /company name/i})).not.toBeInTheDocument()
        for (const label of ["Slogan", "Official Email", "Corporate Address", "Website", "Confirmation Letter Signatory's Title"]) {
            expect(screen.getByLabelText(label)).toBeEnabled()
        }
    })

    it("pre fills every field from GET /api/company-settings (0001 AC-2)", async () => {
        stubApi()
        renderForm()

        expect(await screen.findByLabelText("Slogan")).toHaveValue("Your Trusted Land Partner")
        expect(screen.getByLabelText("Official Email")).toHaveValue("info@ardhiflow.co.tz")
        expect(screen.getByLabelText("Corporate Address")).toHaveValue("Kigamboni, Dar es Salaam")
        expect(screen.getByLabelText("Website")).toHaveValue("https://ardhiflow.co.tz")
        expect(screen.getByLabelText("Confirmation Letter Signatory's Title")).toHaveValue("Managing Director")
    })

    it("starts with empty fields when nothing has been saved yet (0001 AC-4)", async () => {
        stubApi({get: () => json(Object.fromEntries(Object.keys(SAVED).map((k) => [k, null])))})
        renderForm()

        expect(await screen.findByLabelText("Slogan")).toHaveValue("")
        expect(screen.getByLabelText("Website")).toHaveValue("")
    })

    it("saves edits with PUT, sending the session token, trimmed values, and null for cleared fields (0001 AC-2)", async () => {
        stubApi()
        const {user} = renderForm()
        const slogan = await screen.findByLabelText("Slogan")

        await user.clear(slogan)
        await user.type(slogan, "  New slogan  ")
        await user.clear(screen.getByLabelText("Website"))
        await user.click(screen.getByRole("button", {name: "Save Branding"}))

        expect(await screen.findByRole("button", {name: "Save Branding"})).toBeEnabled()
        expect(putCalls()).toHaveLength(1)
        const [, init] = putCalls()[0]
        expect(new Headers(init.headers).get("Authorization")).toBe("Bearer session-token")
        expect(JSON.parse(init.body)).toEqual({...SAVED, slogan: "New slogan", website: null})
        expect(toast).toHaveBeenCalledWith("Save Successful", expect.objectContaining({description: "Branding settings saved"}))
    })

    it("refuses to save an invalid brand color and explains why", async () => {
        stubApi({get: () => json({...SAVED, primaryColor: "green"})})
        const {user} = renderForm()

        await user.click(await screen.findByRole("button", {name: "Save Branding"}))

        expect(await screen.findByText("Enter a 6 digit hex color, e.g. #1e3a5f")).toBeInTheDocument()
        expect(putCalls()).toHaveLength(0)
    })

    it("shows the server's error when the save is forbidden (0001 AC-3)", async () => {
        stubApi({put: () => json({error: "Only an org admin can update company settings"}, 403)})
        const {user} = renderForm()

        await user.click(await screen.findByRole("button", {name: "Save Branding"}))

        await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith("Only an org admin can update company settings"))
        expect(toast).not.toHaveBeenCalledWith("Save Successful", expect.anything())
    })

    it("shows a load error instead of the form when settings cannot be fetched", async () => {
        stubApi({get: () => json({error: "boom"}, 500)})
        renderForm()

        expect(await screen.findByText("Failed to load branding settings (500)")).toBeInTheDocument()
        expect(screen.queryByRole("button", {name: "Save Branding"})).not.toBeInTheDocument()
    })
})
