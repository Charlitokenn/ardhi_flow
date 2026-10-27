// @vitest-environment jsdom
import {describe, expect, it, vi} from "vitest"
import {render, screen} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {type CsvFieldConfig, type CsvImportSummary, ReusableCSVUploader} from "./reusable-csv-uploader.tsx"

vi.mock("sonner", () => ({toast: Object.assign(vi.fn(), {error: vi.fn()})}))

type Contact = {
    fullName: string
    mobileNumber: string
    contactType: string
    email?: string | null
}

// Same required fields as the contacts route's own config.
const fields: CsvFieldConfig<Contact>[] = [
    {key: "fullName", label: "Full Name", type: "string", required: true},
    {key: "mobileNumber", label: "Mobile", type: "string", required: true},
    {key: "contactType", label: "Contact Type", type: "enum", required: true},
    {key: "email", label: "Email", type: "string"},
]

const csv = (text: string, name = "contacts.csv") => new File([text], name, {type: "text/csv"})

const CSV_WITH_BLANK_MOBILE = [
    "Full Name,Mobile,Contact Type,Email",
    "Asha Mdoe,+255700800001,CLIENT,asha@example.com",
    "No Mobile,,CLIENT,",
    "Agent Mike,+255700800002,SALES_AGENT,",
].join("\n")

function setup(props: Partial<Parameters<typeof ReusableCSVUploader<Contact>>[0]> = {}) {
    const onSubmit = vi.fn(props.onSubmit ?? (async () => undefined))
    const user = userEvent.setup()
    const view = render(
        <ReusableCSVUploader<Contact> entityName="contacts" fields={fields} {...props} onSubmit={onSubmit}/>,
    )
    const fileInput = view.container.querySelector<HTMLInputElement>('input[type="file"]')!
    return {user, onSubmit, fileInput}
}

async function uploadAndConfirm(user: ReturnType<typeof userEvent.setup>, fileInput: HTMLInputElement, file: File) {
    await user.upload(fileInput, file)
    await user.click(await screen.findByRole("button", {name: "Continue"}))
    await user.click(await screen.findByRole("button", {name: "Confirm & Upload"}))
}

describe("ReusableCSVUploader", () => {
    describe("with serverValidatesRequiredFields (the contacts import, 0005 AC-4)", () => {
        it("sends a row with a blank required cell without that field, alongside the other rows", async () => {
            const {user, onSubmit, fileInput} = setup({serverValidatesRequiredFields: true})

            await uploadAndConfirm(user, fileInput, csv(CSV_WITH_BLANK_MOBILE))

            expect(onSubmit).toHaveBeenCalledTimes(1)
            const rows = onSubmit.mock.calls[0][0]
            expect(rows).toHaveLength(3)
            expect(rows[0]).toEqual({
                fullName: "Asha Mdoe",
                mobileNumber: "+255700800001",
                contactType: "CLIENT",
                email: "asha@example.com",
            })
            expect(rows[1]).not.toHaveProperty("mobileNumber")
            expect(rows[1]).toMatchObject({fullName: "No Mobile", contactType: "CLIENT"})
            expect(rows[2]).toMatchObject({fullName: "Agent Mike", contactType: "SALES_AGENT"})
        })

        it("shows no client side abort error for the blank required cell", async () => {
            const {user, fileInput} = setup({serverValidatesRequiredFields: true})

            await uploadAndConfirm(user, fileInput, csv(CSV_WITH_BLANK_MOBILE))

            expect(screen.queryByText(/Could not parse required field/)).not.toBeInTheDocument()
        })

        it("renders the server's created / skipped / failed counts and a reason per problem row (0005 AC-1, AC-6)", async () => {
            const summary: CsvImportSummary = {
                created: 1,
                results: [
                    {row: 1, status: "created", id: "c1"},
                    {row: 2, status: "failed", reason: "mobileNumber: Required"},
                    {row: 3, status: "skipped", reason: "Mobile number already exists"},
                ],
            }
            const {user, fileInput} = setup({serverValidatesRequiredFields: true, onSubmit: async () => summary})

            await uploadAndConfirm(user, fileInput, csv(CSV_WITH_BLANK_MOBILE))

            expect(await screen.findByRole("heading", {name: "Import results"})).toBeInTheDocument()
            expect(screen.getByText("Created: 1")).toBeInTheDocument()
            expect(screen.getByText("Skipped: 1")).toBeInTheDocument()
            expect(screen.getByText("Failed: 1")).toBeInTheDocument()
            const problemRows = screen.getAllByRole("row").slice(1).map((row) => row.textContent)
            expect(problemRows).toEqual([
                "2failedmobileNumber: Required",
                "3skippedMobile number already exists",
            ])
            expect(screen.getByText("Rows not listed here were created successfully.")).toBeInTheDocument()
        })

        it("goes back to file selection on Import another file", async () => {
            const summary: CsvImportSummary = {created: 1, results: [{row: 1, status: "created", id: "c1"}]}
            const {user, fileInput} = setup({serverValidatesRequiredFields: true, onSubmit: async () => summary})
            await uploadAndConfirm(user, fileInput, csv(CSV_WITH_BLANK_MOBILE))

            await user.click(await screen.findByRole("button", {name: "Import another file"}))

            expect(screen.getByText(/Drop CSV here or/)).toBeInTheDocument()
            expect(screen.queryByRole("heading", {name: "Import results"})).not.toBeInTheDocument()
        })
    })

    describe("default behavior (serverValidatesRequiredFields off)", () => {
        it("stops at the first blank required cell, names the row and field, and sends nothing", async () => {
            const {user, onSubmit, fileInput} = setup()

            await uploadAndConfirm(user, fileInput, csv(CSV_WITH_BLANK_MOBILE))

            expect(await screen.findByText('Row 3: Could not parse required field "Mobile" from value "".')).toBeInTheDocument()
            expect(onSubmit).not.toHaveBeenCalled()
        })
    })

    it("keeps Continue disabled while a required field has no CSV column", async () => {
        const {user, fileInput} = setup({serverValidatesRequiredFields: true})

        await user.upload(fileInput, csv("Full Name,Contact Type\nAsha Mdoe,CLIENT"))

        expect(await screen.findByRole("button", {name: "Continue"})).toBeDisabled()
    })

    it("rejects a file that is not a CSV before reading it", async () => {
        const {user, fileInput} = setup()

        await user.upload(fileInput, new File(["hello"], "notes.txt", {type: "text/csv"}))

        expect(await screen.findByText("Only CSV files are supported.")).toBeInTheDocument()
        expect(screen.queryByRole("button", {name: "Continue"})).not.toBeInTheDocument()
    })

    it("shows the error from a failed upload and stays on the confirm step", async () => {
        const {user, fileInput} = setup({
            serverValidatesRequiredFields: true,
            onSubmit: async () => {
                throw new Error("Failed to import contacts (500)")
            },
        })
        vi.spyOn(console, "error").mockImplementation(() => {})

        await uploadAndConfirm(user, fileInput, csv(CSV_WITH_BLANK_MOBILE))

        expect(await screen.findByText("Failed to import contacts (500)")).toBeInTheDocument()
        expect(screen.getByRole("button", {name: "Confirm & Upload"})).toBeEnabled()
    })

    it("opens the file picker from the keyboard", async () => {
        const {user, fileInput} = setup()
        const click = vi.spyOn(fileInput, "click")

        screen.getByRole("button", {name: /Drop CSV here or/}).focus()
        await user.keyboard("{Enter}")

        expect(click).toHaveBeenCalled()
    })
})
