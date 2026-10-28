// @vitest-environment jsdom
import {beforeEach, describe, expect, it, vi} from "vitest"
import {render, screen, within} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {QueryClient, QueryClientProvider} from "@tanstack/react-query"
import {CampaignsDataGrid} from "./campaigns-datagrid.tsx"
import {formatDateTimeShort} from "@/lib/utils.ts"

// Boundaries only: Clerk (token), the network, the toast host, and the CSV
// download. Everything else (grid, tabs, dialog) renders for real.
vi.mock("@clerk/react", () => ({useAuth: () => ({getToken: async () => "session-token"})}))

const toastInfo = vi.hoisted(() => vi.fn())
vi.mock("sonner", () => ({toast: {info: toastInfo}}))

const exportToCSV = vi.hoisted(() => vi.fn())
vi.mock("@/lib/export-csv.ts", () => ({exportToCSV}))

// jsdom has no Web Animations API; base-ui's scroll area viewport calls it on
// a timer after mount. Stubbed here so the shared setup file stays untouched.
Element.prototype.getAnimations ??= () => []

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {status, headers: {"content-type": "application/json"}})

type Campaign = {
    id: string
    name: string
    type: string
    status: string
    recipientCount: number
    templateBody: string
    sentCount: number
    deliveredCount: number
    createdAt: string | null
}

const campaign = (overrides: Partial<Campaign>): Campaign => ({
    id: "c-1",
    name: "Campaign",
    type: "GENERAL",
    status: "DRAFT",
    recipientCount: 0,
    templateBody: "Habari",
    sentCount: 0,
    deliveredCount: 0,
    createdAt: "2026-10-20T09:30:00.000Z",
    ...overrides,
})

// Newest first, as GET /api/campaigns returns them.
const CAMPAIGNS: Campaign[] = [
    campaign({
        id: "c-oct",
        name: "October reminders",
        type: "PAYMENT_REMINDER",
        status: "SENT",
        recipientCount: 47,
        templateBody: "Habari {firstName}, your installment is due.",
        sentCount: 45,
        deliveredCount: 41,
        createdAt: "2026-10-20T09:30:00.000Z",
    }),
    campaign({
        id: "c-draft",
        name: "Plot launch",
        type: "MARKETING",
        status: "DRAFT",
        recipientCount: 312,
        createdAt: "2026-10-10T08:00:00.000Z",
    }),
    campaign({
        id: "c-legacy",
        name: "Imported blast",
        type: "LEGACY_TYPE",
        status: "FAILED",
        recipientCount: 8,
        createdAt: null,
    }),
]

let campaignCalls: number

function stubCampaigns(respond: () => Response) {
    campaignCalls = 0
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith("/api/campaigns")) {
            campaignCalls += 1
            return respond()
        }
        throw new Error(`Unexpected request ${url}`)
    }))
}

function renderGrid() {
    const client = new QueryClient({defaultOptions: {queries: {retry: false}}})
    const user = userEvent.setup()
    const onCreateNew = vi.fn()
    render(
        <QueryClientProvider client={client}>
            <CampaignsDataGrid onCreateNew={onCreateNew}/>
        </QueryClientProvider>,
    )
    return {user, onCreateNew}
}

const rowFor = (name: string) => screen.getByText(name).closest("tr") as HTMLElement
const rowNames = () =>
    screen.getAllByRole("row")
        .map((row) => CAMPAIGNS.find((c) => within(row).queryByText(c.name))?.name)
        .filter(Boolean)

describe("CampaignsDataGrid", () => {
    beforeEach(() => {
        vi.unstubAllGlobals()
    })

    describe("populated list", () => {
        beforeEach(() => stubCampaigns(() => json(CAMPAIGNS)))

        it("loads campaigns from GET /api/campaigns once (covers: AC-2)", async () => {
            renderGrid()

            await screen.findByText("October reminders")
            expect(campaignCalls).toBe(1)
        })

        it("shows each row's name, status badge, type label and created date (covers: AC-2)", async () => {
            renderGrid()

            const row = within(await screen.findByText("October reminders").then(() => rowFor("October reminders")))
            expect(row.getByText("SENT")).toBeInTheDocument()
            expect(row.getByText("Payment reminder")).toBeInTheDocument()
            expect(row.getByText(formatDateTimeShort("2026-10-20T09:30:00.000Z"))).toBeInTheDocument()
        })

        it("shows a Recipients column with each row's recipient count (covers: AC-2)", async () => {
            renderGrid()
            await screen.findByText("October reminders")

            expect(screen.getByRole("columnheader", {name: "Recipients"})).toBeInTheDocument()
            expect(within(rowFor("October reminders")).getByText("47")).toBeInTheDocument()
            expect(within(rowFor("Plot launch")).getByText("312")).toBeInTheDocument()
        })

        it("keeps recipients, sent and delivered as separate numbers in a row", async () => {
            renderGrid()
            await screen.findByText("October reminders")

            const cells = within(rowFor("October reminders")).getAllByRole("cell").map((cell) => cell.textContent)
            expect(cells).toEqual(expect.arrayContaining(["47recipients", "45sent", "41delivered"]))
        })

        it("falls back to the raw type when it has no friendly label", async () => {
            renderGrid()
            await screen.findByText("Imported blast")

            expect(within(rowFor("Imported blast")).getByText("LEGACY_TYPE")).toBeInTheDocument()
        })

        it("does not show the first campaign empty state (covers: AC-2)", async () => {
            renderGrid()
            await screen.findByText("October reminders")

            expect(screen.queryByText("You haven't created any campaigns yet.")).not.toBeInTheDocument()
            expect(screen.queryByRole("button", {name: /Create Your First Campaign/})).not.toBeInTheDocument()
        })

        it("counts campaigns per status tab", async () => {
            renderGrid()
            await screen.findByText("October reminders")

            expect(screen.getByRole("tab", {name: "All 3"})).toBeInTheDocument()
            expect(screen.getByRole("tab", {name: "Sent 1"})).toBeInTheDocument()
            expect(screen.getByRole("tab", {name: "Draft 1"})).toBeInTheDocument()
            expect(screen.getByRole("tab", {name: "Scheduled 0"})).toBeInTheDocument()
            expect(screen.getByText("3 items")).toBeInTheDocument()
        })

        it("filters the list to the picked status tab", async () => {
            const {user} = renderGrid()
            await screen.findByText("October reminders")

            await user.click(screen.getByRole("tab", {name: "Draft 1"}))

            expect(screen.getByText("Plot launch")).toBeInTheDocument()
            expect(screen.queryByText("October reminders")).not.toBeInTheDocument()
            expect(screen.getByText("1 items")).toBeInTheDocument()
        })

        it("shows the light no match message, not the first campaign state, when a tab matches nothing (covers: AC-2)", async () => {
            const {user} = renderGrid()
            await screen.findByText("October reminders")

            await user.click(screen.getByRole("tab", {name: "Scheduled 0"}))

            expect(screen.getByText("No campaigns match this filter.")).toBeInTheDocument()
            expect(screen.queryByText("You haven't created any campaigns yet.")).not.toBeInTheDocument()
        })

        it("keeps the server's newest first order by default", async () => {
            renderGrid()
            await screen.findByText("October reminders")

            expect(screen.getByRole("button", {name: "Latest Created"})).toBeInTheDocument()
            expect(rowNames()).toEqual(["October reminders", "Plot launch", "Imported blast"])
        })

        it("flips the sort button label to Oldest Created", async () => {
            const {user} = renderGrid()
            await screen.findByText("October reminders")

            await user.click(screen.getByRole("button", {name: "Latest Created"}))

            expect(screen.getByRole("button", {name: "Oldest Created"})).toBeInTheDocument()
        })

        it("lists the oldest campaign first after switching to Oldest Created", async () => {
            const {user} = renderGrid()
            await screen.findByText("October reminders")

            await user.click(screen.getByRole("button", {name: "Latest Created"}))

            expect(rowNames()[0]).toBe("Plot launch")
        })

        it("keeps a campaign with no created date last when sorting oldest first", async () => {
            const {user} = renderGrid()
            await screen.findByText("October reminders")

            await user.click(screen.getByRole("button", {name: "Latest Created"}))

            expect(rowNames()).toEqual(["Plot launch", "October reminders", "Imported blast"])
        })

        it("goes back to newest first when toggled twice", async () => {
            const {user} = renderGrid()
            await screen.findByText("October reminders")

            await user.click(screen.getByRole("button", {name: "Latest Created"}))
            await user.click(screen.getByRole("button", {name: "Oldest Created"}))

            expect(rowNames()).toEqual(["October reminders", "Plot launch", "Imported blast"])
        })

        it("opens a preview with the type label, recipient count and message body", async () => {
            const {user} = renderGrid()
            await screen.findByText("October reminders")

            // Row actions are icon only: menu trigger, preview (eye), duplicate.
            const previewButton = within(rowFor("October reminders")).getByRole("button", {name: "Preview October reminders"})
            await user.click(previewButton)

            const dialog = await screen.findByRole("dialog")
            expect(within(dialog).getByRole("heading", {name: "October reminders"})).toBeInTheDocument()
            expect(within(dialog).getByText(/Payment reminder · 47 recipient\(s\)/)).toBeInTheDocument()
            expect(within(dialog).getByText("Habari {firstName}, your installment is due.")).toBeInTheDocument()
        })

        it("answers Edit with a not available yet toast, since no write route exists (covers: AC-5)", async () => {
            const {user} = renderGrid()
            await screen.findByText("October reminders")

            const menuTrigger = within(rowFor("October reminders")).getByRole("button", {name: "Actions for October reminders"})
            await user.click(menuTrigger)
            await user.click(await screen.findByRole("menuitem", {name: /Edit/}))

            expect(toastInfo).toHaveBeenCalledWith("Not available yet — coming with the send flow")
        })

        it("answers Delete with a not available yet toast, since no write route exists (covers: AC-5)", async () => {
            const {user} = renderGrid()
            await screen.findByText("October reminders")

            const menuTrigger = within(rowFor("October reminders")).getByRole("button", {name: "Actions for October reminders"})
            await user.click(menuTrigger)
            await user.click(await screen.findByRole("menuitem", {name: /Delete/}))

            expect(toastInfo).toHaveBeenCalledTimes(1)
        })

        it("exports just that row as CSV with recipients included", async () => {
            const {user} = renderGrid()
            await screen.findByText("October reminders")

            const menuTrigger = within(rowFor("October reminders")).getByRole("button", {name: "Actions for October reminders"})
            await user.click(menuTrigger)
            await user.click(await screen.findByRole("menuitem", {name: /Export Data/}))

            expect(exportToCSV).toHaveBeenCalledTimes(1)
            const [rows, columns, filename] = exportToCSV.mock.calls[0]
            expect(rows).toEqual([CAMPAIGNS[0]])
            expect(filename).toBe("October reminders")
            const recipients = columns.find((c: {header: string}) => c.header === "Recipients")
            expect(recipients.accessor(CAMPAIGNS[0])).toBe(47)
        })
    })

    describe("ordering does not rely on the server", () => {
        const drafts = [
            campaign({id: "d-mid", name: "Mid draft", createdAt: "2026-09-15T10:00:00.000Z"}),
            campaign({id: "d-new", name: "New draft", createdAt: "2026-10-25T10:00:00.000Z"}),
            campaign({id: "d-old", name: "Old draft", createdAt: "2026-08-01T10:00:00.000Z"}),
            campaign({id: "s-x", name: "Sent one", status: "SENT", createdAt: "2026-10-26T10:00:00.000Z"}),
        ]
        const names = () =>
            screen.getAllByRole("row")
                .map((row) => drafts.find((c) => within(row).queryByText(c.name))?.name)
                .filter(Boolean)

        beforeEach(() => stubCampaigns(() => json(drafts)))

        it("shows newest first even when rows arrive out of order", async () => {
            renderGrid()
            await screen.findByText("Mid draft")

            expect(names()).toEqual(["Sent one", "New draft", "Mid draft", "Old draft"])
        })

        it("keeps the chosen order inside a filtered tab", async () => {
            const {user} = renderGrid()
            await screen.findByText("Mid draft")

            await user.click(screen.getByRole("tab", {name: "Draft 3"}))
            await user.click(screen.getByRole("button", {name: "Latest Created"}))

            expect(names()).toEqual(["Old draft", "Mid draft", "New draft"])
        })
    })

    describe("no campaigns yet", () => {
        beforeEach(() => stubCampaigns(() => json([])))

        it("shows the first campaign empty state (covers: AC-2)", async () => {
            renderGrid()

            expect(await screen.findByText("You haven't created any campaigns yet.")).toBeInTheDocument()
            expect(screen.getByRole("button", {name: /Create Your First Campaign/})).toBeInTheDocument()
            expect(screen.getByRole("tab", {name: "All 0"})).toBeInTheDocument()
        })

        it("calls onCreateNew from Create Your First Campaign (covers: AC-3)", async () => {
            const {user, onCreateNew} = renderGrid()

            await user.click(await screen.findByRole("button", {name: /Create Your First Campaign/}))

            expect(onCreateNew).toHaveBeenCalledTimes(1)
        })
    })
})
