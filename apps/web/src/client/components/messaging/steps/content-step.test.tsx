// @vitest-environment jsdom
import {beforeEach, describe, expect, it, vi} from "vitest"
import {render, screen} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {QueryClient, QueryClientProvider} from "@tanstack/react-query"
import ContentStep from "./content-step.tsx"

// Boundaries only: Clerk (token) and the network. Covers the "Use a
// template" picker (spec 0002 AC-9).
vi.mock("@clerk/react", () => ({useAuth: () => ({getToken: async () => "session-token"})}))

const PAST_DUE_BODY = "Habari {firstName}, {dueItems} Tafadhari fanya malipo kuepuka tozo za adhabu au kuvunjwa kwa mkataba."
const TEMPLATES = [
    {id: "1", name: "Past Due Payment Reminder", channel: "SMS", isActive: true, body: PAST_DUE_BODY, category: "PAYMENT_REMINDER", reminderTiming: "PAST_DUE"},
    {id: "2", name: "Switched Off", channel: "SMS", isActive: false, body: "off"},
    {id: "3", name: "WhatsApp Thanks", channel: "WHATSAPP", isActive: true, body: "Asante {firstName}"},
]

function stubApi(templates = TEMPLATES) {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).endsWith("/api/message-templates")) {
            return new Response(JSON.stringify(templates), {headers: {"content-type": "application/json"}})
        }
        throw new Error(`Unexpected request ${String(input)}`)
    }))
}

function renderStep(type: "sms" | "whatsapp") {
    const client = new QueryClient({defaultOptions: {queries: {retry: false}}})
    const setCampaign = vi.fn()
    const campaign = {type, title: "", message: "Old text"}
    const user = userEvent.setup()
    render(
        <QueryClientProvider client={client}>
            <ContentStep campaign={campaign} setCampaign={setCampaign}/>
        </QueryClientProvider>,
    )
    return {user, setCampaign, campaign}
}

describe("ContentStep: Use a template", () => {
    beforeEach(() => {
        vi.unstubAllGlobals()
    })

    it("lists only active templates for the selected channel (AC-9)", async () => {
        stubApi()
        const {user} = renderStep("sms")

        await user.click(screen.getByRole("button", {name: /Use a template/}))

        expect(await screen.findByRole("button", {name: "Past Due Payment Reminder"})).toBeInTheDocument()
        expect(screen.queryByRole("button", {name: "Switched Off"})).not.toBeInTheDocument()
        expect(screen.queryByRole("button", {name: "WhatsApp Thanks"})).not.toBeInTheDocument()
    })

    it("inserts the raw body byte for byte, tokens still visible, and takes the template's type and timing (AC-9; spec 0004 AC-6)", async () => {
        stubApi()
        const {user, setCampaign, campaign} = renderStep("sms")

        await user.click(screen.getByRole("button", {name: /Use a template/}))
        await user.click(await screen.findByRole("button", {name: "Past Due Payment Reminder"}))

        expect(setCampaign).toHaveBeenCalledWith({
            ...campaign,
            message: PAST_DUE_BODY,
            templateId: "1",
            templateName: "Past Due Payment Reminder",
            smsType: "PAYMENT_REMINDER",
            reminderTiming: "PAST_DUE",
        })
        expect(screen.queryByRole("button", {name: "Past Due Payment Reminder"})).not.toBeInTheDocument()
    })

    it("lists WhatsApp templates when WhatsApp is the channel (AC-9)", async () => {
        stubApi()
        const {user} = renderStep("whatsapp")

        await user.click(screen.getByRole("button", {name: /Use a template/}))

        expect(await screen.findByRole("button", {name: "WhatsApp Thanks"})).toBeInTheDocument()
        expect(screen.queryByRole("button", {name: "Past Due Payment Reminder"})).not.toBeInTheDocument()
    })

    it("says so when the channel has no active templates", async () => {
        stubApi(TEMPLATES.filter((t) => t.channel === "SMS"))
        const {user} = renderStep("whatsapp")

        await user.click(screen.getByRole("button", {name: /Use a template/}))

        expect(await screen.findByText("No active WhatsApp templates yet.")).toBeInTheDocument()
    })
})
