import type React from "react"
import {Document, Font, Image, Page, StyleSheet, Text, View} from "@react-pdf/renderer"
import {appConfig} from "@/constants/index.tsx";
import {formatDate, thousandSeparator} from "@/lib/utils";

// Register fonts if needed
Font.register({
    family: "Ubuntu",
    src: "https://fonts.gstatic.com/s/ubuntu/v20/4iCv6KVjbNBYlgoC1CzjvmyI.ttf",
})

interface InvoiceItem {
    payments: PaymentsObjects[],
    installments: InstallmentsObjects[],
}

interface PaymentsObjects {
    id: string
    contractId: string
    clientContactId: string
    direction: string
    amount: number
    receivedAt: string
    method: string | null
    reference: string | null
    createdBy: string | null
    createdAt: string | null
}

interface InstallmentsObjects {
    id: string
    contractId: string
    installmentNo: number
    dueDate: string
    amountDue: number
    amountPaid: number
    status: string
    paidAt: string | null
    createdAt: string | null
    updatedAt: string | null
    runningTotal: number
}

interface ClientStatementProps {
    companyName: string
    companySubtitle: string
    statementTitle?: string
    logoUrl: string | null
    referenceNumber: string
    primaryColor?: string | null
    integrationName?: string
    billTo: {
        clientName: string
        projectName: string
        mobile: string
        region: string
        projectLocation: string
        plotSize: string
        pricePerSqm: string
        monthlyInstallment: number | string
        duration: string | number
        salesAgent: string
    }
    statementDetails: {
        contractValue: number | string
        totalPayments: string
        projectName: string
        accountRep: string
        accountRepEmail: string
        currentBalance: string
    }
    invoices: InvoiceItem
    footer: {
        email: string | null,
        mobile: string | null,
        address: string | null,
        website: string | null
    }
    footerNotes?: string
    poweredBy?: string
}

const DEFAULT_BRAND_COLOR = "#1e3a5f"

/**
 * Single source of truth for the payments/installments table's columns.
 *
 * Both the header row and every body row read their width from this array
 * (by index), so they can never drift apart again the way the old
 * per-branch JSX did. Widths sum to exactly 100%.
 */
const TABLE_COLUMNS = [
    // --- Left block: "Malipo Yaliyofanyika" (payments the client has made) ---
    {key: "paymentDate", label: "Tarehe ya Malipo", width: "11%", align: "left" as const, group: "payments" as const},
    {key: "details", label: "Taarifa ya Muamala", width: "12%", align: "center" as const, group: "payments" as const},
    {key: "receiptNumber", label: "Risiti Namba", width: "8%", align: "left" as const, group: "payments" as const},
    {
        key: "paidAmount",
        label: "Kiasi Kilicholipwa",
        width: "12%",
        align: "center" as const,
        group: "payments" as const
    },
    // --- Right block: "Orodha ya Marejesho ya Mkataba" (contract installment schedule) ---
    {
        key: "installmentDate",
        label: "Tarehe ya Rejesho",
        width: "11%",
        align: "center" as const,
        group: "schedule" as const
    },
    {
        key: "installmentNumber",
        label: "Namba ya Rejesho",
        width: "11%",
        align: "center" as const,
        group: "schedule" as const
    },
    {
        key: "installmentAmount",
        label: "Kiasi cha Rejesho",
        width: "12%",
        align: "center" as const,
        group: "schedule" as const
    },
    {key: "allocation", label: "Malipo", width: "11%", align: "center" as const, group: "schedule" as const}, // amount from payments allocated to this installment
    {
        key: "runningTotal",
        label: "Salio la Mkataba",
        width: "12%",
        align: "center" as const,
        group: "schedule" as const
    }, // contract balance after this installment
] as const
// widths sum to exactly 100%

// The "Malipo Yaliyofanyika" / "Orodha ya Marejesho ya Mkataba" label row above
// the table needs to span exactly the same width as the columns underneath it.
// Deriving these from TABLE_COLUMNS (instead of a hardcoded marginLeft/width)
// means the label row can never drift out of alignment with the table again,
// even if columns are resized later.
const sumGroupWidth = (group: "payments" | "schedule") =>
    TABLE_COLUMNS.filter((c) => c.group === group)
        .reduce((total, c) => total + parseFloat(c.width), 0)

const PAYMENTS_GROUP_WIDTH = `${sumGroupWidth("payments")}%`
const SCHEDULE_GROUP_WIDTH = `${sumGroupWidth("schedule")}%`

// Built per render from the caller's real branding color (see
// docs/specs/0001-contacts-completion/0003-client-statement-pdf.md) instead
// of a module level constant baked in once at import time.
const createStyles = (primaryColor: string) => StyleSheet.create({
    page: {
        backgroundColor: "#FFFFFF",
        padding: 30,
        fontFamily: "Ubuntu",
        fontSize: 9,
    },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginBottom: 15,
        paddingBottom: 10,
    },
    rightHeaderSection: {
        flexDirection: "column",
        alignItems: "flex-end",   // align children to the right
        flex: 1,
    },
    infoRowRightTop: {
        flexDirection: "row",
        justifyContent: "flex-end", // push label/value to the right
        marginTop: 15,
    },
    infoRowRight: {
        flexDirection: "row",
        justifyContent: "flex-end", // push label/value to the right
    },
    infoHeaderLabel: {
        fontSize: 8,
        color: "#333",
        marginRight: 4,
        fontWeight: "bold",
        textAlign: "right",
    },
    infoHeaderValue: {
        fontSize: 8,
        color: "#333",
        width: "45%",
        textAlign: "right",
    },
    logo: {
        width: 120,
        height: 40,
        objectFit: "contain",
        marginLeft: -30,
        marginTop: 8,
        borderRadius: 5,
    },
    companySection: {
        flexDirection: "column",
    },
    companyName: {
        fontSize: 16,
        fontWeight: "bold",
        color: primaryColor,
        marginBottom: 2,
    },
    companySubtitle: {
        fontSize: 8,
        color: "#666",
    },
    statementSection: {
        alignItems: "flex-end",
    },
    statementTitle: {
        fontSize: 18,
        fontWeight: "bold",
        color: primaryColor,
        marginBottom: 2,
    },
    statementSubtitle: {
        fontSize: 8,
        color: "#666",
    },
    infoSection: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginBottom: 15,
        paddingVertical: 10,
    },
    infoColumnLeft: {
        width: "45%",
    },
    infoColumnRight: {
        width: "35%",
    },
    infoHeader: {
        backgroundColor: primaryColor,
        color: "#FFFFFF",
        padding: 5,
        fontSize: 9,
        fontWeight: "bold",
        marginBottom: 5,
    },
    infoRow: {
        flexDirection: "row",
        marginBottom: 3,
    },
    infoLabel: {
        fontSize: 8,
        color: "#333",
        width: "35%",
        fontWeight: "bold",
    },
    infoValue: {
        fontSize: 8,
        color: "#333",
        width: "65%",
    },
    infoValueRight: {
        fontSize: 8,
        color: "#333",
        width: "65%",
        textAlign: "right",
    },
    accountSection: {
        backgroundColor: "#f5f5f5",
        padding: 8,
        flexDirection: "row",
    },
    accountItem: {
        flexDirection: "column",
        alignItems: "center",
    },
    accountLabel: {
        fontSize: 7,
        color: "#666",
        marginBottom: 2,
    },
    accountValue: {
        fontSize: 8,
        color: "#333",
        fontWeight: "bold",
    },
    table: {
        width: "100%",
        marginBottom: 10,
    },
    tableHeader: {
        flexDirection: "row",
        backgroundColor: primaryColor,
        color: "#FFFFFF",
        padding: 5,
        fontSize: 7,
        fontWeight: "bold",
        borderBottom: 1,
        borderBottomColor: "#FFFFFF",
    },
    tableRow: {
        flexDirection: "row",
        borderBottom: 1,
        borderBottomColor: "#ddd",
        minHeight: 18,
        alignItems: "center",
    },
    tableRowAlt: {
        backgroundColor: "#f9f9f9",
    },
    // Generic cell style — width/align come from TABLE_COLUMNS at render time
    // so header cells and body cells are always driven by the same numbers.
    tableCell: {
        padding: 2,
        fontSize: 7,
    },
    tableCellHeader: {
        padding: 2,
        fontSize: 7,
        fontWeight: "bold",
    },
    subHeader: {
        backgroundColor: "#4a6fa5",
        color: "#FFFFFF",
        padding: 4,
        fontSize: 7,
        fontWeight: "bold",
    },
    totalsRow: {
        flexDirection: "row",
        // justifyContent: "flex-end",
        backgroundColor: primaryColor,
        color: "#FFFFFF",
        padding: 8,
        // marginTop: 5,
    },
    totalsLabel: {
        fontSize: 10,
        fontWeight: "bold",
        marginRight: 20,
    },
    totalsValue: {
        fontSize: 10,
        fontWeight: "bold",
    },
    footer: {
        marginTop: 15,
        paddingTop: 10,
        borderTop: 1,
        borderTopColor: "#ddd",
    },
    footerText: {
        fontSize: 8,
        color: "#666",
        textAlign: "center",
        marginBottom: 3,
    },
    footerBold: {
        fontSize: 8,
        color: "#333",
        textAlign: "center",
        fontWeight: "extrabold",
        marginBottom: 3,
    },
    poweredBy: {
        fontSize: 6,
        color: "#999",
        textAlign: "center",
        marginTop: 10,
    },
    dividerLeft: {
        borderBottomWidth: 0.5,
        borderBottomColor: "#A9A9A9",
        marginVertical: 1,
    },
    dividerRight: {
        borderBottomWidth: 0.5,
        borderBottomColor: "#A9A9A9",
        marginTop: 10,
        marginBottom: 2,
    }
})

export const ClientStatementDocument: React.FC<ClientStatementProps> = ({
                                                                            companyName,
                                                                            companySubtitle,
                                                                            statementTitle,
                                                                            logoUrl,
                                                                            referenceNumber,
                                                                            primaryColor,
                                                                            billTo,
                                                                            statementDetails,
                                                                            invoices,
                                                                            footer,
                                                                            footerNotes,
                                                                        }) => {
    const styles = createStyles(primaryColor || DEFAULT_BRAND_COLOR)

    // Merge payments + installments into one row-shaped array instead of
    // branching on which list is longer and rendering two different JSX
    // shapes (that divergence was the root cause of the header/body
    // column misalignment).
    const rowCount = Math.max(invoices.payments?.length ?? 0, invoices.installments?.length ?? 0)
    const rows = Array.from({length: rowCount}, (_, i) => ({
        payment: invoices.payments?.[i] ?? null,
        installment: invoices.installments?.[i] ?? null,
    }))

    return (
        <Document
            title="Client Statement"
            author={appConfig.name}
            subject="Client Account Statement"
            keywords=""
            creator={appConfig.name}
            producer={appConfig.name}
        >
            <Page size="A4" style={styles.page}>
                {/* Header Section */}
                <View style={styles.header}>
                    <View style={styles.companySection}>
                        <Text style={styles.companyName}>{companyName}</Text>
                        <Text style={styles.companySubtitle}>{companySubtitle}</Text>
                        {logoUrl && (
                            <Image
                                src={logoUrl}
                                style={styles.logo}
                            />
                        )}
                    </View>
                    <View style={styles.rightHeaderSection}>
                        <Text style={styles.statementTitle}>{statementTitle}</Text>

                        <View style={styles.infoRowRightTop}>
                            <Text style={styles.infoHeaderLabel}>Tarehe:</Text>
                            <Text style={styles.infoHeaderValue}>
                                {formatDate(new Date().toLocaleString())}
                            </Text>
                        </View>

                        <View style={styles.infoRowRight}>
                            <Text style={styles.infoHeaderLabel}>Kumb Namba:</Text>
                            <Text style={styles.infoHeaderValue}>{referenceNumber}</Text>
                        </View>
                    </View>
                </View>
                {/* Bill To and Statement Details Section */}
                <View style={styles.infoSection}>
                    <View style={styles.infoColumnLeft}>
                        <Text style={styles.infoHeader}>Mlipaji</Text>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Jina:</Text>
                            <Text style={styles.infoValue}>{billTo.clientName}</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Mradi:</Text>
                            <Text style={styles.infoValue}>{billTo.projectName}</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Namba ya Simu:</Text>
                            <Text style={styles.infoValue}>
                                {billTo.mobile}
                            </Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Mkoa:</Text>
                            <Text style={styles.infoValue}>{billTo.region}</Text>
                        </View>
                        <View style={styles.dividerLeft}/>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Eneo la Mradi:</Text>
                            <Text style={styles.infoValue}>{billTo.projectLocation}</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Ukubwa wa Eneo:</Text>
                            <Text style={styles.infoValue}>{billTo.plotSize}</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Bei ya Mauzo:</Text>
                            <Text style={styles.infoValue}>{billTo.pricePerSqm}</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Rejesho la Mwezi:</Text>
                            <Text style={styles.infoValue}>{billTo.monthlyInstallment}</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Idadi ya Marejesho:</Text>
                            <Text style={styles.infoValue}>{billTo.duration}</Text>
                        </View>
                        <View style={styles.dividerLeft}/>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Afisa Mauzo:</Text>
                            <Text style={styles.infoValue}>{billTo.salesAgent}</Text>
                        </View>
                    </View>

                    <View style={styles.infoColumnRight}>
                        <Text style={styles.infoHeader}>Taarifa Fupi</Text>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Bei ya Kiwanja:</Text>
                            <Text style={styles.infoValueRight}>{statementDetails.contractValue}</Text>
                        </View>
                        <View style={styles.dividerRight}/>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Jumla ya Malipo:</Text>
                            <Text style={styles.infoValueRight}>{statementDetails.totalPayments}</Text>
                        </View>
                        <View style={styles.dividerRight}/>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Salio la Mkataba:</Text>
                            <Text style={styles.infoValueRight}>{statementDetails.currentBalance}</Text>
                        </View>
                    </View>
                </View>

                {/* Account Details Section */}
                <View style={styles.accountSection}>
                    <View style={[styles.accountItem, {width: PAYMENTS_GROUP_WIDTH}]}>
                        <Text style={styles.accountValue}>Malipo Yaliyofanyika</Text>
                    </View>

                    <View style={[styles.accountItem, {width: SCHEDULE_GROUP_WIDTH}]}>
                        <Text style={styles.accountValue}>Orodha ya Marejesho ya Mkataba</Text>
                    </View>
                </View>

                {/* Table Section */}
                <View style={styles.table}>
                    {/* Table Header — widths/labels driven entirely by TABLE_COLUMNS */}
                    <View style={styles.tableHeader}>
                        {TABLE_COLUMNS.map((col) => (
                            <Text
                                key={col.key}
                                style={[styles.tableCellHeader, {width: col.width, textAlign: col.align}]}
                            >
                                {col.label}
                            </Text>
                        ))}
                    </View>

                    {/* Table Rows — single row template, same 8 cells every time,
                        each cell reading its width from the same TABLE_COLUMNS
                        array as the header above. */}
                    {rows.map(({payment, installment}, index) => (
                        <View key={index} style={[styles.tableRow, index % 2 === 1 ? styles.tableRowAlt : {}]}>
                            <Text style={[styles.tableCell, {
                                width: TABLE_COLUMNS[0].width,
                                textAlign: TABLE_COLUMNS[0].align
                            }]}>
                                {payment ? formatDate(payment.receivedAt) : ""}
                            </Text>
                            <Text style={[styles.tableCell, {
                                width: TABLE_COLUMNS[1].width,
                                textAlign: TABLE_COLUMNS[1].align,
                                fontWeight: "bold"
                            }]}>
                                {payment ? "Malipo ya rejesho" : ""}
                            </Text>
                            <Text style={[styles.tableCell, {
                                width: TABLE_COLUMNS[2].width,
                                textAlign: TABLE_COLUMNS[2].align
                            }]}>
                                {payment?.reference ?? ""}
                            </Text>
                            <Text
                                style={[
                                    styles.tableCell,
                                    {
                                        width: TABLE_COLUMNS[3].width,
                                        textAlign: TABLE_COLUMNS[3].align,
                                        borderRightWidth: 1,
                                        borderRightColor: "#ddd",
                                    },
                                ]}
                            >
                                {payment ? `Tshs. ${thousandSeparator(payment.amount)}` : ""}
                            </Text>
                            <Text style={[styles.tableCell, {
                                width: TABLE_COLUMNS[4].width,
                                textAlign: TABLE_COLUMNS[4].align
                            }]}>
                                {installment ? formatDate(installment.dueDate) : ""}
                            </Text>
                            <Text style={[styles.tableCell, {
                                width: TABLE_COLUMNS[5].width,
                                textAlign: TABLE_COLUMNS[5].align
                            }]}>
                                {/*
                                  Explicit null/undefined check (not truthiness) so a legitimate
                                  installmentNo of 0 still renders. Also don't lean on
                                  thousandSeparator's own falsy-handling for the number itself —
                                  format it directly here and only fall back to thousandSeparator
                                  when the value is a genuinely large number worth comma-grouping.
                                */}
                                {installment && installment.installmentNo !== null && installment.installmentNo !== undefined
                                    // installmentNo is 0-indexed in the data — 0 is the downpayment,
                                    // not "installment #0", so label it explicitly. Everything after
                                    // that is a regular installment, shown 1-indexed for the client.
                                    ? (installment.installmentNo === 0
                                        ? "Downpayment"
                                        : `Rejesho Na. ${installment.installmentNo}`)
                                    : ""}
                            </Text>
                            <Text style={[styles.tableCell, {
                                width: TABLE_COLUMNS[6].width,
                                textAlign: TABLE_COLUMNS[6].align
                            }]}>
                                {installment ? `Tshs. ${thousandSeparator(installment.amountDue)}` : ""}
                            </Text>
                            {/* Allocation: how much of the payments received was applied to this installment */}
                            <Text style={[styles.tableCell, {
                                width: TABLE_COLUMNS[7].width,
                                textAlign: TABLE_COLUMNS[7].align
                            }]}>
                                {installment ? `Tshs. ${thousandSeparator(installment.amountPaid)}` : ""}
                            </Text>
                            {/* Running total: contract balance remaining after this installment */}
                            <Text style={[styles.tableCell, {
                                width: TABLE_COLUMNS[8].width,
                                textAlign: TABLE_COLUMNS[8].align
                            }]}>
                                {installment ? `Tshs. ${thousandSeparator(installment.runningTotal)}` : ""}
                            </Text>
                        </View>
                    ))}

                    {/* Totals Row — same TABLE_COLUMNS widths, so it lines up too */}
                    <View style={styles.tableHeader}>
                        <Text style={[styles.tableCellHeader, {width: TABLE_COLUMNS[0].width}]}>Jumla:</Text>
                        <Text style={[styles.tableCellHeader, {width: TABLE_COLUMNS[1].width}]}></Text>
                        <Text style={[styles.tableCellHeader, {width: TABLE_COLUMNS[2].width}]}></Text>
                        <Text style={[styles.tableCellHeader, {width: TABLE_COLUMNS[3].width, textAlign: "center"}]}>
                            {statementDetails.totalPayments}
                        </Text>
                        <Text style={[styles.tableCellHeader, {width: TABLE_COLUMNS[4].width}]}></Text>
                        <Text style={[styles.tableCellHeader, {width: TABLE_COLUMNS[5].width}]}></Text>
                        <Text style={[styles.tableCellHeader, {width: TABLE_COLUMNS[6].width, textAlign: "center"}]}>
                            {statementDetails.contractValue}
                        </Text>
                        <Text style={[styles.tableCellHeader, {width: TABLE_COLUMNS[7].width, textAlign: "center"}]}>
                            {statementDetails.totalPayments}
                        </Text>
                        <Text style={[styles.tableCellHeader, {width: TABLE_COLUMNS[8].width, textAlign: "center"}]}>
                            {statementDetails.currentBalance}
                        </Text>
                    </View>
                </View>

                {/* Footer Section */}
                <View style={styles.footer}>
                    <Text style={styles.footerText}>{footerNotes}</Text>
                    <Text style={[styles.footerBold, {marginTop: 6}]}>Malipo yote yalipwe kwa {companyName}</Text>
                    <Text style={[styles.footerText, {marginTop: 6}]}>Kwa maswali ya aina yoyote kuhusiana na taarifa
                        hizi za malipo, tafadhali wasiliana idara ya Fedha kwa namba {footer.mobile}</Text>
                    <Text style={[styles.footerText, {marginTop: 6}]}>{footer.address}</Text>
                    <Text
                        style={[styles.footerText, {marginTop: 6}]}>{!footer.email ? "" : `Barua Pepe: ${footer.email}`} {!footer.website ? "" : `| Tovuti: ${footer.website}`}</Text>
                </View>
            </Page>
        </Document>
    )
}