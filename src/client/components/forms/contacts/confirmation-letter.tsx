import type React from "react"
import {Document, Font, Image, Page, StyleSheet, Text, View} from "@react-pdf/renderer"
import {appConfig} from "@/constants/index.tsx"
import {formatSwahiliDate} from "@/lib/swahili-date.ts"

Font.register({
    family: "Ubuntu",
    src: "https://fonts.gstatic.com/s/ubuntu/v20/4iCv6KVjbNBYlgoC1CzjvmyI.ttf",
})

const DEFAULT_BRAND_COLOR = "#1e3a5f"

const createStyles = (primaryColor: string) => StyleSheet.create({
    page: {
        backgroundColor: "#FFFFFF",
        padding: 40,
        fontFamily: "Ubuntu",
        fontSize: 10,
        lineHeight: 1.5,
    },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: 24,
        paddingBottom: 10,
        borderBottom: 1,
        borderBottomColor: "#ddd",
    },
    companySection: {
        flexDirection: "column",
    },
    companyName: {
        fontSize: 14,
        fontWeight: "bold",
        color: primaryColor,
        marginBottom: 2,
    },
    logo: {
        width: 100,
        height: 34,
        objectFit: "contain",
    },
    referenceBlock: {
        alignItems: "flex-end",
    },
    referenceLabel: {
        fontSize: 8,
        color: "#666",
    },
    referenceValue: {
        fontSize: 9,
        color: "#333",
        fontWeight: "bold",
    },
    recipientBlock: {
        marginBottom: 16,
    },
    recipientLine: {
        fontSize: 10,
        color: "#111",
        marginBottom: 2,
    },
    subject: {
        fontSize: 10,
        fontWeight: "bold",
        marginBottom: 14,
        textAlign: "left",
    },
    paragraph: {
        fontSize: 10,
        color: "#111",
        marginBottom: 12,
        textAlign: "justify",
    },
    contactLine: {
        fontSize: 9,
        color: "#333",
        marginBottom: 2,
    },
    closing: {
        marginTop: 20,
    },
    closingLine: {
        fontSize: 10,
        color: "#111",
        marginBottom: 2,
    },
    signatureLine: {
        fontSize: 10,
        color: "#111",
        marginTop: 26,
        marginBottom: 2,
    },
    signerTitle: {
        fontSize: 10,
        color: "#111",
    },
    footer: {
        position: "absolute",
        bottom: 30,
        left: 40,
        right: 40,
        paddingTop: 8,
        borderTop: 1,
        borderTopColor: "#ddd",
    },
    footerText: {
        fontSize: 8,
        color: "#666",
        textAlign: "center",
    },
})

export interface ConfirmationLetterProps {
    companyName: string
    logoUrl: string | null
    primaryColor?: string | null
    referenceNumber: string
    clientFullName: string
    projectName: string
    plotNumber: string
    plotSize: string
    street: string
    ward: string
    district: string
    region: string
    mobileNumber: string | null
    email: string | null
    address: string | null
    website: string | null
    signerTitle: string | null
    date?: Date
}

// Renders the sample confirmation letter's wording verbatim (see
// docs/specs/0001-contacts-completion/0004-confirmation-letter-pdf.md), with
// only the placeholders filled from real data.
export const ConfirmationLetterDocument: React.FC<ConfirmationLetterProps> = ({
    companyName,
    logoUrl,
    primaryColor,
    referenceNumber,
    clientFullName,
    projectName,
    plotNumber,
    plotSize,
    street,
    ward,
    district,
    region,
    mobileNumber,
    email,
    address,
    website,
    signerTitle,
    date = new Date(),
}) => {
    const styles = createStyles(primaryColor || DEFAULT_BRAND_COLOR)
    const dateLabel = formatSwahiliDate(date)

    return (
        <Document
            title="Confirmation Letter"
            author={appConfig.name}
            subject="Uthibitisho wa Kumaliza Malipo"
            keywords=""
            creator={appConfig.name}
            producer={appConfig.name}
        >
            <Page size="A4" style={styles.page}>
                <View style={styles.header}>
                    <View style={styles.companySection}>
                        <Text style={styles.companyName}>{companyName}</Text>
                        {logoUrl && <Image src={logoUrl} style={styles.logo}/>}
                    </View>
                    <View style={styles.referenceBlock}>
                        <Text style={styles.referenceLabel}>Kumb Namba</Text>
                        <Text style={styles.referenceValue}>{referenceNumber}</Text>
                    </View>
                </View>

                <View style={styles.recipientBlock}>
                    <Text style={styles.recipientLine}>KWA,</Text>
                    <Text style={styles.recipientLine}>{clientFullName},</Text>
                    <Text style={styles.recipientLine}>{region.toUpperCase()}, {dateLabel}</Text>
                </View>

                <Text style={styles.subject}>
                    REF: UTHIBITISHO WA KUMALIZA MALIPO YA UNUNUZI WA KIWANJA KILICHOPO MRADI WA {projectName}
                </Text>

                <Text style={styles.paragraph}>Ndugu {clientFullName},</Text>

                <Text style={styles.paragraph}>
                    Rejea kichwa cha habari hapo juu. Barua hii ni kuthibitisha kwamba umefanya manunuzi ya kiwanja
                    Na. {plotNumber}, chenye ukubwa wa mita za mraba {plotSize}, kilichopo Mtaa wa {street}, kata
                    ya {ward}, wilaya ya {district}, mkoa wa {region}, kupitia {companyName} na malipo ya kiwanja
                    yamekamilika na huna deni tena na {companyName}.
                </Text>

                <Text style={styles.paragraph}>
                    Tunashukuru kwa kuwa mteja mwaminifu na tunakutakia mafanikio mema katika kujenga taifa. Karibu
                    sana {companyName}. Kwa mawasiliano zaidi usisite kuwasiliana nasi unapokuwa na uhitaji wa
                    huduma zetu.
                </Text>

                <Text style={styles.contactLine}>Namba za simu: {mobileNumber || "—"}</Text>
                <Text style={styles.contactLine}>Barua Pepe: {email || "—"}</Text>

                <View style={styles.closing}>
                    <Text style={styles.closingLine}>Wako,</Text>
                    <Text style={styles.closingLine}>{companyName},</Text>
                    <Text style={styles.signatureLine}>..................................</Text>
                    <Text style={styles.signerTitle}>{signerTitle || "—"}</Text>
                </View>

                <View style={styles.footer}>
                    <Text style={styles.footerText}>
                        {address ? `${address} ` : ""}{website ? `| ${website}` : ""}
                    </Text>
                </View>
            </Page>
        </Document>
    )
}
