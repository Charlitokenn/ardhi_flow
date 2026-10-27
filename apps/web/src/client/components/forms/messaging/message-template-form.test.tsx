// @vitest-environment jsdom
import {beforeEach, describe, expect, it, vi} from "vitest"
import {render, screen, waitFor} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {QueryClient, QueryClientProvider} from "@tanstack/react-query"
import {toast} from "sonner"
import {MessageTemplateForm} from "./message-template-form.tsx"

// Boundaries only: Clerk (token), toasts, and the network.
vi.mock("@clerk/react", () => ({useAuth: () => ({getToken: async () => "session-token"})}))
vi.mock("sonner", () => ({toast: Object.assign(vi.fn(), {success: vi.fn(), error: vi.fn()})}))

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {status, headers: {"content-type": "application/json"}})

let fetchMock: ReturnType<typeof vi.fn>

function stubApi(save: (body: unknown, method: string) => Response = (body) => json(body, 201)) {
    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const method = init?.method ?? "GET"
        if (url.endsWith("/api/message-templates/preview")) {
            return json({text: "rendered", charCount: 8, segmentCount: 1, dueItemsFound: 0})
        }
        if (/\/api\/message-templates(\/[\w-]+)?$/.test(url) && (method === "POST" || method === "PATCH")) {
            return save(JSON.parse(String(init?.body)), method)
        }
        throw new Error(`Unexpected request ${method} ${url}`)
    })
    vi.stubGlobal("fetch", fetchMock)
}

const saveCalls = () => fetchMock.mock.calls.filter(([url, init]) =>
    !String(url).endsWith("/preview") && (init?.method === "POST" || init?.method === "PATCH"))

function renderForm(props: Parameters<typeof MessageTemplateForm>[0] = {mode: "create"}) {
    const client = new QueryClient({defaultOptions: {queries: {retry: false}}})
    const user = userEvent.setup()
    render(
        <QueryClientProvider client={client}>
            <MessageTemplateForm {...props}/>
        </QueryClientProvider>,
    )
    return {user}
}

describe("MessageTemplateForm", () => {
    beforeEach(() => {
        vi.unstubAllGlobals()
    })

    it("creates a template with the typed name and body, then confirms it (AC-1)", async () => {
        stubApi()
        const {user} = renderForm()

        await user.type(screen.getByLabelText("Name"), "  Asante  ")
        await user.type(screen.getByLabelText("Message"), "Asante sana")
        await user.click(screen.getByRole("button", {name: /Create template/}))

        await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Template created"))
        expect(JSON.parse(String(saveCalls()[0][1].body))).toEqual({
            name: "Asante",
            category: "PAYMENT_REMINDER",
            reminderTiming: null,
            channel: "SMS",
            body: "Asante sana",
        })
    })

    it("blocks a body using {dueItems} with no timing and saves nothing (AC-1, Key invariants)", async () => {
        stubApi()
        const {user} = renderForm()

        await user.type(screen.getByLabelText("Name"), "Kumbusho")
        await user.type(screen.getByLabelText("Message"), "Habari {{firstName}, {{dueItems}")
        await user.click(screen.getByRole("button", {name: /Create template/}))

        expect(await screen.findByText("Required when the body uses {dueItems}")).toBeInTheDocument()
        expect(saveCalls()).toHaveLength(0)
    })

    it("requires a name and a body", async () => {
        stubApi()
        const {user} = renderForm()

        await user.click(screen.getByRole("button", {name: /Create template/}))

        expect(await screen.findByText("Name is required")).toBeInTheDocument()
        expect(screen.getByText("Body is required")).toBeInTheDocument()
        expect(saveCalls()).toHaveLength(0)
    })

    it("shows the server's reason when a member is refused (AC-4)", async () => {
        stubApi(() => json({error: "Only an org admin can manage message templates"}, 403))
        const {user} = renderForm()

        await user.type(screen.getByLabelText("Name"), "x")
        await user.type(screen.getByLabelText("Message"), "y")
        await user.click(screen.getByRole("button", {name: /Create template/}))

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Only an org admin can manage message templates"))
        expect(toast.success).not.toHaveBeenCalled()
    })

    it("saves an edit as a PATCH to that template's id (AC-4)", async () => {
        stubApi((body) => json(body))
        const {user} = renderForm({
            mode: "edit",
            template: {id: "t-1", name: "Old", category: "GENERAL", reminderTiming: null, channel: "WHATSAPP", body: "Hi"},
        })

        const name = screen.getByLabelText("Name")
        await user.clear(name)
        await user.type(name, "New")
        await user.click(screen.getByRole("button", {name: /Save|Update/}))

        await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Template updated"))
        const [url, init] = saveCalls()[0]
        expect(String(url)).toMatch(/\/api\/message-templates\/t-1$/)
        expect(init.method).toBe("PATCH")
        expect(JSON.parse(String(init.body))).toMatchObject({name: "New", channel: "WHATSAPP", category: "GENERAL"})
    })

    it("shows the live preview while typing (AC-7)", async () => {
        stubApi()
        const {user} = renderForm()

        await user.type(screen.getByLabelText("Message"), "Hi")

        expect(await screen.findByText("rendered")).toBeInTheDocument()
        expect(screen.getByRole("button", {name: /Sample client \(James\)/})).toBeInTheDocument()
    })
})
