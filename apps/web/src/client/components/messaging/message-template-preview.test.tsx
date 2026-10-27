// @vitest-environment jsdom
import {beforeEach, describe, expect, it, vi} from "vitest"
import {render, screen, waitFor} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {QueryClient, QueryClientProvider} from "@tanstack/react-query"
import {MessageTemplatePreview} from "./message-template-preview.tsx"
import type {ReminderTiming} from "@/components/forms/messaging/message-template-form.tsx"

// Boundaries only: Clerk (token) and the network. The worker does the
// rendering, so each preview response here is what the worker would return.
vi.mock("@clerk/react", () => ({useAuth: () => ({getToken: async () => "session-token"})}))

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {status, headers: {"content-type": "application/json"}})

const CONTACTS = [
    {id: "c-said", fullName: "Said Massawe", isDeleted: false},
    {id: "c-gone", fullName: "Old Client", isDeleted: true},
]

type PreviewRequest = {contactId?: string; body: string; reminderTiming: ReminderTiming | null}
let previewCalls: PreviewRequest[]

function stubApi(respond: (req: PreviewRequest) => Response) {
    previewCalls = []
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith("/api/message-templates/preview")) {
            const req = JSON.parse(String(init?.body)) as PreviewRequest
            previewCalls.push(req)
            return respond(req)
        }
        if (url.endsWith("/api/contacts")) return json(CONTACTS)
        throw new Error(`Unexpected request ${url}`)
    }))
}

const rendered = (text: string, dueItemsFound = 1, charCount = text.length, segmentCount = 1) =>
    json({text, charCount, segmentCount, dueItemsFound})

function renderPreview(body: string, reminderTiming: ReminderTiming | null = "PAST_DUE") {
    const client = new QueryClient({defaultOptions: {queries: {retry: false}}})
    const user = userEvent.setup()
    const view = render(
        <QueryClientProvider client={client}>
            <MessageTemplatePreview body={body} reminderTiming={reminderTiming}/>
        </QueryClientProvider>,
    )
    const rerender = (nextBody: string) => view.rerender(
        <QueryClientProvider client={client}>
            <MessageTemplatePreview body={nextBody} reminderTiming={reminderTiming}/>
        </QueryClientProvider>,
    )
    return {user, rerender}
}

describe("MessageTemplatePreview", () => {
    beforeEach(() => {
        vi.unstubAllGlobals()
    })

    it("starts on the sample client and asks the worker to render it, with no contactId (AC-7)", async () => {
        stubApi(() => rendered("Habari James, ...", 1, 243, 2))
        renderPreview("Habari {firstName}, {dueItems}")

        expect(screen.getByRole("button", {name: /Sample client \(James\)/})).toBeInTheDocument()
        expect(await screen.findByText("Habari James, ...")).toBeInTheDocument()
        expect(previewCalls[0]).toEqual({body: "Habari {firstName}, {dueItems}", reminderTiming: "PAST_DUE"})
        expect(previewCalls[0]).not.toHaveProperty("contactId")
    })

    it("shows the worker's exact character and segment counts, not a local estimate (AC-7)", async () => {
        stubApi(() => rendered("Habari James, ...", 1, 243, 2))
        renderPreview("Habari {firstName}, {dueItems}")

        expect(await screen.findByText("243 characters")).toBeInTheDocument()
        expect(screen.getByText("2 SMS segment(s)")).toBeInTheDocument()
    })

    it("never shows the nothing due note for the sample, even with no due items", async () => {
        stubApi(() => rendered("Habari James, Nothing due for this reminder timing.", 0))
        renderPreview("Habari {firstName}, {dueItems}", "UPCOMING")

        await screen.findByText("Habari James, Nothing due for this reminder timing.")
        expect(screen.queryByText("Nothing due for this client in this timing right now.")).not.toBeInTheDocument()
    })

    it("shows a placeholder when the body is empty", async () => {
        stubApi(() => rendered("", 0, 0, 0))
        renderPreview("", null)

        expect(await screen.findByText("Nothing typed yet.")).toBeInTheDocument()
        expect(screen.getByText("0 characters")).toBeInTheDocument()
    })

    it("renders again after the admin stops typing, with the latest body (AC-7)", async () => {
        stubApi((req) => rendered(`R: ${req.body}`))
        const {rerender} = renderPreview("Habari", null)
        await screen.findByText("R: Habari")

        rerender("Habari James")

        expect(await screen.findByText("R: Habari James")).toBeInTheDocument()
    })

    it("switches to a picked real client and sends that contactId (AC-5)", async () => {
        stubApi((req) => rendered(req.contactId ? "Habari Said, ..." : "Habari James, ..."))
        const {user} = renderPreview("Habari {firstName}, {dueItems}")
        await screen.findByText("Habari James, ...")

        await user.click(screen.getByRole("button", {name: /Sample client \(James\)/}))
        await user.click(await screen.findByRole("option", {name: "Said Massawe"}))

        expect(await screen.findByText("Habari Said, ...")).toBeInTheDocument()
        expect(screen.getByRole("button", {name: /Said Massawe/})).toBeInTheDocument()
        expect(previewCalls.at(-1)).toMatchObject({contactId: "c-said"})
    })

    it("lists only live contacts in the picker", async () => {
        stubApi(() => rendered("x"))
        const {user} = renderPreview("x", null)

        await user.click(screen.getByRole("button", {name: /Sample client \(James\)/}))

        expect(await screen.findByRole("option", {name: "Said Massawe"})).toBeInTheDocument()
        expect(screen.queryByRole("option", {name: "Old Client"})).not.toBeInTheDocument()
    })

    it("shows the nothing due note for a real client with nothing in that timing (AC-11)", async () => {
        stubApi((req) => rendered("Habari, Nothing due for this reminder timing.", req.contactId ? 0 : 1))
        const {user} = renderPreview("Habari {firstName}, {dueItems}", "UPCOMING")
        await screen.findByText("Habari, Nothing due for this reminder timing.")

        await user.click(screen.getByRole("button", {name: /Sample client \(James\)/}))
        await user.click(await screen.findByRole("option", {name: "Said Massawe"}))

        expect(await screen.findByText("Nothing due for this client in this timing right now.")).toBeInTheDocument()
    })

    it("shows the worker's error message when a render is refused", async () => {
        stubApi(() => json({error: "A template whose body contains {dueItems} must set reminderTiming"}, 422))
        renderPreview("{dueItems}", null)

        expect(await screen.findByText("A template whose body contains {dueItems} must set reminderTiming")).toBeInTheDocument()
        await waitFor(() => expect(screen.queryByText(/characters$/)).not.toBeInTheDocument())
    })
})
