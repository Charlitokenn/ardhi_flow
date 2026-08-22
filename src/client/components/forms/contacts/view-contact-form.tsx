import * as React from "react"
import {PageHero} from "@/components/pageHero"
import {FileCheck2, FileText, HouseIcon} from "lucide-react"
import {formatInternationalWithSpaces, thousandSeparator, toProperCase} from "@/lib/utils"
import {ClientStatementDocument} from "@/components/forms/contacts/client-statement.tsx"
import {ConfirmationLetterDocument} from "@/components/forms/contacts/confirmation-letter.tsx"
import {PDFDownloadLink, PDFViewer} from "@react-pdf/renderer"
import {ImportIcon} from "@/assets/icons"
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select"
import type {ClientContact} from "@/types/contacts.ts"
import type {DocumentBrandingExtra} from "@/types/branding.ts"
import {buildDocumentReferenceNumber} from "@/lib/document-reference.ts"
import {
    computeContractBalance,
    computeTotalPaid,
    isContractFullyPaid,
    withRunningTotals
} from "@/lib/contract-balance.ts"
import CustomTabs from "@/components/custom-tabs.tsx"

export const ViewContactForm = ({contact, extra}: {
    contact: ClientContact
    extra: DocumentBrandingExtra
}) => {
    const [selectedPlotId, setSelectedPlotId] = React.useState<string>(
        contact?.plots?.[0]?.id ?? ""
    )
    const selectedPlot = contact?.plots?.find((plot) => plot.id === selectedPlotId)
    const latestContract = selectedPlot?.latestContract ?? null

    const tabsData: TabItem[] = React.useMemo(() => {
        const plotsCount = contact?.plots?.length ?? 0
        const hasPlots = plotsCount > 0
        const isClient = contact?.contactType === "CLIENT"

        const plotSizeRaw = selectedPlot?.surveyedSize ?? selectedPlot?.unsurveyedSize ?? "0"
        const plotSize = thousandSeparator(Number(plotSizeRaw))

        const duration = latestContract?.termMonths ?? 0
        const contractValue = latestContract ? Number(latestContract.totalContractValue) : 0
        const pricePerSqm = Number(plotSizeRaw) > 0 ? contractValue / Number(plotSizeRaw) : 0
        const totalPayments = latestContract ? computeTotalPaid(latestContract) : 0
        const balance = latestContract ? computeContractBalance(latestContract) : 0
        const displayBalance = Math.max(balance, 0)
        const fullyPaid = isContractFullyPaid(latestContract)

        const installmentsWithRunning = latestContract
            ? withRunningTotals(latestContract, latestContract.installments)
            : []

        // Monthly installment, per the contract's own purchase plan. For the
        // DOWNPAYMENT plan, use the contract's own financedAmount (already
        // totalContractValue minus downpaymentAmount) rather than re-deriving
        // it from downpaymentPercent, which is stored as a whole number
        // (e.g. 20 meaning 20%), not a 0-1 fraction.
        const monthlyInstallment = (() => {
            if (!latestContract) return 0
            const total = Number(latestContract.totalContractValue)
            const months = latestContract.termMonths
            if (!months) return 0
            if (latestContract.purchasePlan === "FLAT_RATE") return total / months
            if (months > 1) {
                return Number(latestContract.financedAmount) / (months - 1)
            }
            return 0
        })()

        const salesAgentName = latestContract?.salesAgent?.fullName ?? "—"
        const salesAgentEmail = latestContract?.salesAgent?.email ?? "—"

        const projectName = selectedPlot?.project.projectName ?? ""
        const statementReferenceNumber = buildDocumentReferenceNumber(
            extra.companyName, projectName, contact.fullName, "STMT"
        )
        const letterReferenceNumber = buildDocumentReferenceNumber(
            extra.companyName, projectName, contact.fullName, "CONF"
        )
        const clientSlug = contact.fullName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
        const statementFileName = `statement-${clientSlug}-${statementReferenceNumber.replace(/\//g, "-")}.pdf`
        const letterFileName = `confirmation-${clientSlug}-${letterReferenceNumber.replace(/\//g, "-")}.pdf`

        const statementDocument = (
            <ClientStatementDocument
                companyName={extra.companyName}
                companySubtitle={extra.branding.slogan ?? ""}
                statementTitle="Taarifa ya Malipo"
                logoUrl={extra.logoUrl}
                primaryColor={extra.branding.primaryColor}
                referenceNumber={statementReferenceNumber}
                billTo={{
                    clientName: contact.fullName,
                    projectName,
                    mobile: formatInternationalWithSpaces(contact.mobileNumber ?? "") ?? "",
                    region: `${contact.region ?? ""} ${contact.street ?? ""} ${contact.ward ?? ""}`.trim(),
                    projectLocation: `${projectName} - Plot No. ${selectedPlot?.plotNumber ?? ""}`,
                    plotSize: `Sqm ${plotSize}`,
                    pricePerSqm: `Tshs. ${thousandSeparator(pricePerSqm)} /Sqm`,
                    monthlyInstallment: `Tshs. ${thousandSeparator(monthlyInstallment)}`,
                    duration: `${duration}`,
                    salesAgent: salesAgentName,
                }}
                statementDetails={{
                    contractValue: `Tshs. ${thousandSeparator(contractValue)}`,
                    totalPayments: `Tshs. ${thousandSeparator(totalPayments)}`,
                    projectName,
                    accountRep: salesAgentName,
                    accountRepEmail: salesAgentEmail,
                    currentBalance: `Tshs. ${thousandSeparator(displayBalance)}`,
                }}
                invoices={{
                    payments: (latestContract?.payments ?? [])
                        .filter((payment) => payment.direction === "IN")
                        .map((payment) => ({...payment, amount: Number(payment.amount)})),
                    installments: installmentsWithRunning.map((installment) => ({
                        ...installment,
                        amountDue: Number(installment.amountDue),
                        amountPaid: Number(installment.amountPaid),
                        runningTotal: installment.runningTotal ?? 0,
                    })),
                }}
                footer={{
                    email: extra.branding.email,
                    address: extra.branding.address,
                    mobile: formatInternationalWithSpaces(extra.branding.mobileNumber ?? ""),
                    website: extra.branding.website,
                }}
                footerNotes={
                    fullyPaid
                        ? "Umekamilisha kulipa malipo yote. Asante kwa kuwa mteja wetu wa thamani."
                        : `Salio la mkataba wako ni Tshs. ${thousandSeparator(displayBalance)}. Tafadhali fanya malipo kulipa kiasi kilichobakia kabla ya mkataba kuisha.`
                }
            />
        )

        const letterDocument = latestContract && (
            <ConfirmationLetterDocument
                companyName={extra.companyName}
                logoUrl={extra.logoUrl}
                primaryColor={extra.branding.primaryColor}
                referenceNumber={letterReferenceNumber}
                clientFullName={contact.fullName}
                projectName={projectName}
                plotNumber={selectedPlot?.plotNumber ?? ""}
                plotSize={plotSize}
                street={selectedPlot?.project.street ?? ""}
                ward={selectedPlot?.project.ward ?? ""}
                district={selectedPlot?.project.district ?? ""}
                region={selectedPlot?.project.region ?? ""}
                mobileNumber={extra.branding.mobileNumber}
                email={extra.branding.email}
                address={extra.branding.address}
                website={extra.branding.website}
                signerTitle={extra.branding.signerTitle}
            />
        )

        const plotSelector = (
            <Select value={selectedPlotId} onValueChange={setSelectedPlotId}>
                <SelectTrigger>
                    <SelectValue placeholder="Select Plot/Contract"/>
                </SelectTrigger>
                <SelectContent>
                    {contact.plots.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                            <span>{item.project.projectName}</span> - Plot No.<span>{item.plotNumber}</span>
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        )

        const tabs: VerticalTabItem[] = [
            {
                id: "tab-1",
                label: "Overview",
                icon: HouseIcon,
                content: (
                    <div className="rounded border-dashed min-h-122.5 mr-3 pl-6 py-1 mx-3">
                        <PageHero
                            title={contact.fullName}
                            subtitle={`Contact Type: ${toProperCase(contact.contactType?.replace("_", " "))}`}
                            type="hero"
                        />
                    </div>
                ),
            },
        ]

        if (hasPlots && isClient) {
            tabs.push({
                id: "tab-2",
                label: "Client Statement",
                icon: FileText,
                content: (
                    <div className="rounded border-dashed min-h-122.5 mr-3 pl-6 py-1 mx-3">
                        <div className="flex justify-between gap-2 mb-2">
                            {plotSelector}
                            <PDFDownloadLink document={statementDocument} fileName={statementFileName}>
                                {({blob, url, loading, error}) =>
                                    loading ? <span className="text-sm">Loading document...</span>
                                        : <span className="flex text-sm">
                                            <ImportIcon className="size-5"/> Download Statement
                                        </span>
                                }
                            </PDFDownloadLink>
                        </div>
                        {latestContract ? (
                            <PDFViewer width="100%" height={480} showToolbar={false} className="rounded-lg">
                                {statementDocument}
                            </PDFViewer>
                        ) : (
                            <div
                                className="flex h-120 items-center justify-center rounded-lg border border-dashed text-center text-sm text-muted-foreground px-8">
                                This plot has no contract yet.
                            </div>
                        )}
                    </div>
                ),
            })

            tabs.push({
                id: "tab-3",
                label: "Confirmation Letter",
                icon: FileCheck2,
                content: (
                    <div className="rounded border-dashed min-h-122.5 mr-3 pl-6 py-1 mx-3">
                        <div className="flex justify-between gap-2 mb-2">
                            {plotSelector}
                            {fullyPaid && letterDocument ? (
                                <PDFDownloadLink document={letterDocument} fileName={letterFileName}>
                                    {({loading}) =>
                                        loading ? <span className="text-sm">Preparing...</span>
                                            : <span className="flex text-sm">
                                            <ImportIcon className="size-5"/> Download Letter
                                        </span>
                                    }
                                </PDFDownloadLink>
                            ) : (
                                <span className="flex text-sm cursor-not-allowed">
                                   <ImportIcon className="size-5"/> Download Letter
                                </span>
                            )}
                        </div>
                        {fullyPaid && letterDocument ? (
                            <PDFViewer width="100%" height={480} showToolbar={false} className="rounded-lg">
                                {letterDocument}
                            </PDFViewer>
                        ) : (
                            <div
                                className="flex h-120 items-center justify-center rounded-lg border border-dashed text-center text-sm text-muted-foreground px-8">
                                Available when the selected contract balance is fully paid.
                            </div>
                        )}
                    </div>
                ),
            })
        }

        return tabs
    }, [contact, extra, selectedPlot, selectedPlotId, latestContract])

    return (
        <div className="mt-4">
            <CustomTabs
                defaultValue="tab-1"
                tabs={tabsData}
                skeletonTabCount={4}
                unstyled
            />
        </div>
    )
}