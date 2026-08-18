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
    colPaymentDate: {
        width: "12%",
        padding: 2,
        fontSize: 7,
    },
    colDetails: {
        width: "15%",
        padding: 2,
        fontSize: 7,
        textAlign: "center",
    },
    colReceiptNumber: {
        width: "9%",
        padding: 2,
        fontSize: 7,
    },
    colPaidAmount: {
        width: "15%",
        padding: 2,
        fontSize: 7,
        textAlign: "center",
    },
    colInstallmentDate: {
        width: "13%",
        padding: 2,
        fontSize: 7,
        textAlign: "center",
    },
    colInstallment: {
        width: "13%",
        padding: 2,
        fontSize: 7,
        textAlign: "center",
    },
    colInstallmentBalance: {
        width: "12%",
        padding: 2,
        fontSize: 7,
        textAlign: "center",
    },
    colContractBalance: {
        width: "12%",
        padding: 2,
        fontSize: 7,
        textAlign: "center",
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
                    <View style={styles.accountItem}>
                        <Text style={styles.accountValue}>Malipo Yaliyofanyika</Text>
                    </View>

                    <View style={styles.accountItem}>
                        <Text style={[styles.accountValue, {marginLeft: 130}]}>Orodha Marejesho ya Mkataba</Text>
                    </View>
                </View>

                {/* Table Section */}
                <View style={styles.table}>
                    {/* Table Header */}
                    <View style={styles.tableHeader}>
                        <Text style={styles.colPaymentDate}>Tarehe ya Malipo</Text>
                        <Text style={styles.colDetails}>Taarifa ya Muamala</Text>
                        <Text style={styles.colPaidAmount}>Kiasi Kilicholipwa</Text>
                        <Text style={styles.colInstallmentDate}>Tarehe ya Rejesho</Text>
                        <Text style={styles.colInstallmentDate}>Namba ya Rejesho</Text>
                        <Text style={styles.colInstallment}>Kiasi cha Rejesho</Text>
                        <Text style={styles.colInstallmentBalance}>Malipo</Text>
                        <Text style={styles.colContractBalance}>Salio la Mkataba</Text>
                    </View>

                    {/* Table Rows */}
                    {invoices.payments?.length >= invoices.installments?.length ?
                        invoices.payments.map((payment, index) => (
                            <View key={index} style={[styles.tableRow, index % 2 === 1 ? styles.tableRowAlt : {}]}>
                                <Text style={styles.colPaymentDate}>{formatDate(payment.receivedAt)}</Text>
                                <Text style={styles.colDetails}>
                                    {index < invoices.installments.length ? "Malipo ya rejesho" : ""}
                                </Text>
                                <Text style={styles.colReceiptNumber}>{payment.reference}</Text>
                                <Text style={[styles.colPaidAmount, {borderRightWidth: 1, borderRightColor: "#ddd"}]}>
                                    Tshs. {thousandSeparator(payment.amount)}
                                </Text>
                                <Text style={styles.colInstallmentDate}>
                                    {index < invoices.installments.length ? formatDate(invoices.installments[index].dueDate) : ""}
                                </Text>
                                <Text style={styles.colInstallment}>
                                    {index < invoices.installments.length ? `Tshs. ${thousandSeparator(invoices.installments[index].amountDue)}` : ""}
                                </Text>
                                <Text style={styles.colInstallmentBalance}>
                                    {index < invoices.installments.length ? `Tshs. ${thousandSeparator(invoices.installments[index].amountPaid)}` : ""}
                                </Text>
                                <Text style={styles.colContractBalance}>
                                    {index < invoices.installments.length ? `Tshs. ${invoices.installments[index].status}` : ""}
                                </Text>
                            </View>
                        ))
                        :
                        invoices.installments.map((installment, index) => (
                            <View key={index} style={[styles.tableRow, index % 2 === 1 ? styles.tableRowAlt : {}]}>
                                <Text style={styles.colPaymentDate}>
                                    {index < invoices.payments.length ? formatDate(invoices.payments[index].receivedAt) : ""}
                                </Text>
                                <Text style={styles.colDetails}>
                                    {index < invoices.payments.length ? "Malipo ya rejesho" : ""}
                                </Text>
                                <Text style={[styles.colPaidAmount, {borderRightWidth: 1, borderRightColor: "#ddd"}]}>
                                    {index < invoices.payments.length ? `Tshs. ${thousandSeparator(invoices.payments[index].amount)}` : ""}
                                </Text>
                                <Text style={styles.colInstallmentDate}>
                                    {formatDate(installment.dueDate)}
                                </Text>
                                <Text style={styles.colInstallment}>
                                    Rejesho Na. {thousandSeparator(installment.installmentNo)}
                                </Text>
                                <Text style={styles.colInstallment}>
                                    Tshs. {thousandSeparator(installment.amountDue)}
                                </Text>
                                <Text style={styles.colInstallmentBalance}>
                                    Tshs. {thousandSeparator(installment.amountPaid)}
                                </Text>
                                <Text style={styles.colContractBalance}>
                                    Tshs. {thousandSeparator(installment.runningTotal)}
                                </Text>
                            </View>
                        ))
                    }

                    {/* Totals Row */}
                    <View style={styles.tableHeader}>
                        <Text style={styles.colPaymentDate}>Jumla:</Text>
                        <Text style={styles.colDetails}></Text>
                        <Text style={styles.colPaidAmount}>{statementDetails.totalPayments}</Text>
                        <Text style={styles.colInstallmentDate}></Text>
                        <Text style={styles.colInstallmentBalance}></Text>
                        <Text style={styles.colInstallment}>{statementDetails.contractValue}</Text>
                        <Text style={styles.colInstallmentBalance}>{statementDetails.totalPayments}</Text>
                        <Text style={styles.colContractBalance}>{statementDetails.currentBalance}</Text>
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