import {isValidElement, type ReactElement, type ReactNode} from "react"
import {describe, expect, it} from "vitest"
import {Image} from "@react-pdf/renderer"
import {ConfirmationLetterDocument, type ConfirmationLetterProps} from "./confirmation-letter.tsx"

// The letter is a pure @react-pdf document with no hooks, so calling it gives
// the element tree. Reading the text from that tree checks the wording without
// laying out a real PDF (whose text layer drops characters in this font).

type Props = { children?: ReactNode }

function lines(node: ReactNode): string[] {
    if (!isValidElement(node)) return []
    const {children} = (node as ReactElement<Props>).props
    const kids = Array.isArray(children) ? children : [children]
    if (kids.every((kid) => typeof kid === "string" || typeof kid === "number" || kid == null || kid === false)) {
        const text = kids.filter((kid) => typeof kid === "string" || typeof kid === "number").join("")
        return text ? [text.replace(/\s+/g, " ").trim()] : []
    }
    return kids.flatMap(lines)
}

function containsType(node: ReactNode, type: unknown): boolean {
    if (!isValidElement(node)) return false
    if (node.type === type) return true
    const {children} = (node as ReactElement<Props>).props
    return (Array.isArray(children) ? children : [children]).some((kid) => containsType(kid, type))
}

const baseProps: ConfirmationLetterProps = {
    companyName: "TAJ Homes",
    logoUrl: "https://img.clerk.com/logo.png",
    primaryColor: "#0F6B3D",
    referenceNumber: "TH/MbweniHeights/PL/20261027-CONF",
    clientFullName: "Peter Lema",
    projectName: "Mbweni Heights",
    plotNumber: "1",
    plotSize: "687",
    street: "Mbweni Road",
    ward: "Mbweni",
    district: "Kinondoni",
    region: "Dar es Salaam",
    mobileNumber: "+255754000000",
    email: "info@ardhiflow.co.tz",
    address: "Kigamboni, Dar es Salaam",
    website: "https://ardhiflow.co.tz",
    signerTitle: "Managing Director",
    date: new Date(2026, 9, 27),
}

const render = (props: Partial<ConfirmationLetterProps> = {}) =>
    ConfirmationLetterDocument({...baseProps, ...props}) as ReactElement

describe("ConfirmationLetterDocument", () => {
    it("fills the sample letter's placeholders word for word (0004 AC-2)", () => {
        const text = lines(render())

        expect(text).toContain("KWA,")
        expect(text).toContain("Peter Lema,")
        expect(text).toContain("DAR ES SALAAM, 27 Oktoba 2026")
        expect(text).toContain("REF: UTHIBITISHO WA KUMALIZA MALIPO YA UNUNUZI WA KIWANJA KILICHOPO MRADI WA Mbweni Heights")
        expect(text).toContain("Ndugu Peter Lema,")
        expect(text).toContain(
            "Rejea kichwa cha habari hapo juu. Barua hii ni kuthibitisha kwamba umefanya manunuzi ya kiwanja " +
            "Na. 1, chenye ukubwa wa mita za mraba 687, kilichopo Mtaa wa Mbweni Road, kata ya Mbweni, " +
            "wilaya ya Kinondoni, mkoa wa Dar es Salaam, kupitia TAJ Homes na malipo ya kiwanja yamekamilika " +
            "na huna deni tena na TAJ Homes.",
        )
        expect(text).toContain(
            "Tunashukuru kwa kuwa mteja mwaminifu na tunakutakia mafanikio mema katika kujenga taifa. Karibu " +
            "sana TAJ Homes. Kwa mawasiliano zaidi usisite kuwasiliana nasi unapokuwa na uhitaji wa huduma zetu.",
        )
    })

    it("shows the reference number under Kumb Namba (0004 AC-5)", () => {
        const text = lines(render())

        expect(text).toContain("Kumb Namba")
        expect(text).toContain("TH/MbweniHeights/PL/20261027-CONF")
    })

    it("shows the saved branding: contacts, signer title, and footer (0004 AC-3)", () => {
        const text = lines(render())

        expect(text).toContain("Namba za simu: +255754000000")
        expect(text).toContain("Barua Pepe: info@ardhiflow.co.tz")
        expect(text).toContain("Wako,")
        expect(text).toContain("TAJ Homes,")
        expect(text).toContain("..................................")
        expect(text).toContain("Managing Director")
        expect(text).toContain("Kigamboni, Dar es Salaam | https://ardhiflow.co.tz")
    })

    it("falls back to blanks, never placeholder text, when branding is unset (0004 AC-3)", () => {
        const text = lines(render({
            mobileNumber: null,
            email: null,
            address: null,
            website: null,
            signerTitle: null,
            primaryColor: null,
        }))

        expect(text).toContain("Namba za simu:")
        expect(text).toContain("Barua Pepe:")
        expect(text.join("\n")).not.toMatch(/—|null|undefined/)
        expect(text).not.toContain("Managing Director")
    })

    it("shows the logo only when the org has one (0004 AC-3)", () => {
        expect(containsType(render(), Image)).toBe(true)
        expect(containsType(render({logoUrl: null}), Image)).toBe(false)
    })
})
