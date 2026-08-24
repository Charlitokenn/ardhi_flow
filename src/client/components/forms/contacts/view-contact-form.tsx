import React, {useMemo, useState} from "react";
import type {LucideIcon} from "lucide-react";
import {
    BriefcaseBusinessIcon,
    FileCheck2,
    FileText,
    HouseIcon,
    Mail,
    MapPlusIcon,
    Phone,
    ShieldCheck,
    UserIcon,
    UserRound,
    Users,
    WalletIcon,
} from "lucide-react";
import {formatInternationalWithSpaces, getInitials, thousandSeparator, toProperCase,} from "@/lib/utils";
import {ClientStatementDocument} from "@/components/forms/contacts/client-statement.tsx";
import {ConfirmationLetterDocument} from "@/components/forms/contacts/confirmation-letter.tsx";
import {PDFDownloadLink, PDFViewer} from "@react-pdf/renderer";
import {ImportIcon} from "@/assets/icons";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue,} from "@/components/ui/select";
import type {ClientContact, ClientContactContract, ClientContactPlot,} from "@/types/contacts.ts";
import type {DocumentBrandingExtra} from "@/types/branding.ts";
import {buildDocumentReferenceNumber} from "@/lib/document-reference.ts";
import {
    computeContractBalance,
    computeTotalPaid,
    isContractFullyPaid,
    withRunningTotals,
} from "@/lib/contract-balance.ts";
import CustomTabsVertical, {type VerticalTabItem,} from "@/components/custom-tabs-vertical.tsx";
import {CustomTabsHorizontal, type HorizontalTabItem,} from "@/components/custom-tabs-horizontal.tsx";
import {Avatar, AvatarBadge, AvatarFallback, AvatarImage,} from "@/components/ui/avatar.tsx";
import {Badge} from "@/components/ui/badge.tsx";
import {ContactSection, DetailItem,} from "@/components/views/contact-overview.tsx";
import {PlotsHeldDataGrid} from "@/components/data-grids/plots-held-datagrid.tsx";
import {CommissionPaymentsDataGrid} from "@/components/data-grids/commission-payments-datagrid.tsx";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONTACT_TYPE = {
    CLIENT: "CLIENT",
    SALES_AGENT: "SALES_AGENT",
    LAND_SELLER: "LAND_SELLER",
} as const;

const PLACEHOLDER_COPY = (
    <>
        Manage your{" "}
        <span className="text-foreground font-semibold">account details</span>. Keep
        everything up to date so we can serve you better.
    </>
);

// ---------------------------------------------------------------------------
// Financial derivation (isolated so it's independently testable)
// ---------------------------------------------------------------------------

interface ContractFinancials {
    plotSize: string;
    plotSizeRaw: number;
    duration: number;
    contractValue: number;
    pricePerSqm: number;
    totalPayments: number;
    balance: number;
    displayBalance: number;
    fullyPaid: boolean;
    monthlyInstallment: number;
    installmentsWithRunning: ReturnType<typeof withRunningTotals>;
}

function deriveContractFinancials(
    plot: ClientContactPlot | undefined,
    contract: ClientContactContract | null,
): ContractFinancials {
    const plotSizeRaw = Number(plot?.surveyedSize ?? plot?.unsurveyedSize ?? "0");
    const contractValue = contract ? Number(contract.totalContractValue) : 0;
    const pricePerSqm = plotSizeRaw > 0 ? contractValue / plotSizeRaw : 0;
    const totalPayments = contract ? computeTotalPaid(contract) : 0;
    const balance = contract ? computeContractBalance(contract) : 0;

    return {
        plotSize: thousandSeparator(plotSizeRaw),
        plotSizeRaw,
        duration: contract?.termMonths ?? 0,
        contractValue,
        pricePerSqm,
        totalPayments,
        balance,
        displayBalance: Math.max(balance, 0),
        fullyPaid: isContractFullyPaid(contract),
        // Monthly installment follows the contract's own purchase plan. For the
        // DOWNPAYMENT plan we use the contract's own `financedAmount` (already
        // totalContractValue minus downpaymentAmount) rather than re-deriving it
        // from downpaymentPercent, which is stored as a whole number (e.g. 20
        // meaning 20%), not a 0-1 fraction.
        monthlyInstallment: (() => {
            if (!contract) return 0;
            const {termMonths: months, totalContractValue, purchasePlan} = contract;
            if (!months) return 0;
            if (purchasePlan === "FLAT_RATE")
                return Number(totalContractValue) / months;
            if (months > 1) return Number(contract.financedAmount) / (months - 1);
            return 0;
        })(),
        installmentsWithRunning: contract
            ? withRunningTotals(contract, contract.installments)
            : [],
    };
}

// ---------------------------------------------------------------------------
// Small presentational pieces
// ---------------------------------------------------------------------------

function ContactHeader({contact}: { contact: ClientContact }) {
    const locationLabel = [
        contact.region,
        contact.district,
        contact.ward,
        contact.street,
    ]
        .filter(Boolean)
        .map(toProperCase)
        .join(", ");

    return (
        <div className="flex items-center gap-3 mb-8">
            <Avatar size="lg">
                <AvatarImage src={contact.clientPhoto ?? undefined} alt=""/>
                <AvatarFallback>{getInitials(contact.fullName)}</AvatarFallback>
                <AvatarBadge>
                    <UserIcon/>
                </AvatarBadge>
            </Avatar>
            <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                    <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
                        {contact.fullName}
                    </h1>
                    <Badge variant="secondary" className="text-xs">
                        {toProperCase(contact.contactType?.replace("_", " "))}
                    </Badge>
                </div>
                <div
                    className="flex flex-col gap-1 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
                    {contact.mobileNumber && (
                        <a
                            href={`tel:${contact.mobileNumber}`}
                            className="inline-flex items-center gap-1.5 hover:text-foreground"
                        >
                            <Phone className="size-3.5 shrink-0"/>
                            <span>{contact.mobileNumber}</span>
                        </a>
                    )}

                    {contact.email && (
                        <>
                            {contact.mobileNumber && <Separator/>}
                            <a
                                href={`mailto:${contact.email}`}
                                className="inline-flex min-w-0 items-center gap-1.5 hover:text-foreground"
                            >
                                <Mail className="size-3.5 shrink-0"/>
                                <span className="truncate break-all">{contact.email}</span>
                            </a>
                        </>
                    )}

                    {locationLabel && (
                        <>
                            {(contact.mobileNumber || contact.email) && <Separator/>}
                            <span className="inline-flex min-w-0 items-center gap-1.5">
                <MapPlusIcon className="size-3.5 shrink-0"/>
                <span className="truncate">{locationLabel}</span>
              </span>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

function Separator() {
    return (
        <span className="hidden sm:inline text-border" aria-hidden="true">
      ·
    </span>
    );
}

function NextOfKinSection({contact}: { contact: ClientContact }) {
    const contacts = [
        {
            label: "First next of kin",
            name: contact.firstNOKName,
            mobile: contact.firstNOKMobile,
            relationship: contact.firstNOKRelationship,
        },
        {
            label: "Second next of kin",
            name: contact.secondNOKName,
            mobile: contact.secondNOKMobile,
            relationship: contact.secondNOKRelationship,
        },
    ];

    return (
        <ContactSection title="Next of Kin Contacts">
            <div className="grid gap-6 md:grid-cols-2">
                {contacts.map((entry) => (
                    <div
                        key={entry.label}
                        className="flex min-w-0 flex-col gap-4 rounded-md border bg-muted/30 p-4"
                    >
                        <div className="flex items-center gap-3">
                            <Avatar className="size-10">
                                <AvatarFallback className="bg-primary/10 text-primary">
                                    <Users className="size-4"/>
                                </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                                <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                                    {entry.label}
                                </p>
                                <p className="truncate text-sm font-semibold">
                                    {entry.name || "Not provided"}
                                </p>
                            </div>
                        </div>
                        <dl className="grid gap-3 sm:grid-cols-2">
                            <DetailItem label="Relationship" value={entry.relationship}/>
                            <DetailItem
                                label="Mobile"
                                value={entry.mobile}
                                href={entry.mobile ? `tel:${entry.mobile}` : undefined}
                                icon={<Phone className="size-3.5"/>}
                            />
                        </dl>
                    </div>
                ))}
            </div>
        </ContactSection>
    );
}

function PersonalParticularsContent({contact}: { contact: ClientContact }) {
    return (
        <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
                <ContactSection title="Personal Information">
                    <dl className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
                        <DetailItem
                            label="Gender"
                            value={contact.gender}
                            icon={<UserRound className="size-3.5"/>}
                        />
                        <DetailItem
                            label="Alternative Mobile"
                            value={contact.altMobileNumber}
                            href={
                                contact.altMobileNumber
                                    ? `tel:${contact.altMobileNumber}`
                                    : undefined
                            }
                            icon={<Phone className="size-3.5"/>}
                        />
                    </dl>
                </ContactSection>

                <ContactSection title="Identification">
                    <dl className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
                        <DetailItem
                            label="ID Type"
                            value={contact.idType}
                            icon={<ShieldCheck className="size-3.5"/>}
                        />
                        <DetailItem
                            label="ID Number"
                            value={contact.idNumber}
                            icon={<ShieldCheck className="size-3.5"/>}
                        />
                    </dl>
                </ContactSection>
            </div>

            <NextOfKinSection contact={contact}/>
        </div>
    );
}

function PlotsHeldTabContent({contact}: { contact: ClientContact }) {
    return (
        <ContactSection title="Plots Held">
            <PlotsHeldDataGrid plots={contact.plots}/>
        </ContactSection>
    );
}

function CommissionPaymentsTabContent({contact}: { contact: ClientContact }) {
    return <CommissionPaymentsDataGrid contracts={contact.plotSaleContractsAsAgent}/>
}

function PdfTabHeader({
                          plotSelector,
                          document,
                          fileName,
                          enabled = true,
                          loadingLabel = "Loading document...",
                          actionLabel = "Download Statement",
                          disabledLabel,
                      }: {
    plotSelector: React.ReactNode;
    document: React.ReactElement;
    fileName: string;
    enabled?: boolean;
    loadingLabel?: string;
    actionLabel?: string;
    disabledLabel?: string;
}) {
    return (
        <div className="flex justify-between gap-2 mb-2">
            {plotSelector}
            {enabled ? (
                <PDFDownloadLink document={document} fileName={fileName}>
                    {({loading}) =>
                        loading ? (
                            <span className="text-sm">{loadingLabel}</span>
                        ) : (
                            <span className="flex text-sm">
                <ImportIcon className="size-5"/> {actionLabel}
              </span>
                        )
                    }
                </PDFDownloadLink>
            ) : (
                <span className="flex text-sm cursor-not-allowed text-muted-foreground">
          <ImportIcon className="size-5"/> {disabledLabel ?? actionLabel}
        </span>
            )}
        </div>
    );
}

function EmptyDocumentState({message}: { message: string }) {
    return (
        <div
            className="flex h-120 items-center justify-center rounded-lg border border-dashed text-center text-sm text-muted-foreground px-8">
            {message}
        </div>
    );
}

function StatementTabContent({
                                 plotSelector,
                                 document,
                                 fileName,
                                 hasContract,
                             }: {
    plotSelector: React.ReactNode;
    document: React.ReactElement;
    fileName: string;
    hasContract: boolean;
}) {
    return (
        <div className="rounded border-dashed min-h-122.5 mr-3 pl-6 py-1 mx-3">
            <PdfTabHeader
                plotSelector={plotSelector}
                document={document}
                fileName={fileName}
            />
            {hasContract ? (
                <PDFViewer
                    width="100%"
                    height={480}
                    showToolbar={false}
                    className="rounded-lg"
                >
                    {document}
                </PDFViewer>
            ) : (
                <EmptyDocumentState message="This plot has no contract yet."/>
            )}
        </div>
    );
}

function ConfirmationLetterTabContent({
                                          plotSelector,
                                          document,
                                          fileName,
                                          fullyPaid,
                                      }: {
    plotSelector: React.ReactNode;
    document: React.ReactElement | null;
    fileName: string;
    fullyPaid: boolean;
}) {
    const available = fullyPaid && document !== null;

    return (
        <div className="rounded border-dashed min-h-122.5 mr-3 pl-6 py-1 mx-3">
            <PdfTabHeader
                plotSelector={plotSelector}
                document={document as React.ReactElement}
                fileName={fileName}
                enabled={available}
                loadingLabel="Preparing..."
                actionLabel="Download Letter"
            />
            {available ? (
                <PDFViewer
                    width="100%"
                    height={480}
                    showToolbar={false}
                    className="rounded-lg"
                >
                    {document}
                </PDFViewer>
            ) : (
                <EmptyDocumentState message="Available when the selected contract balance is fully paid."/>
            )}
        </div>
    );
}

function PlaceholderTabContent() {
    return <>{PLACEHOLDER_COPY}</>;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const ViewContactForm = ({
                                    contact,
                                    extra,
                                }: {
    contact: ClientContact;
    extra: DocumentBrandingExtra;
}) => {
    const [selectedPlotId, setSelectedPlotId] = useState<string>(
        contact?.plots?.[0]?.id ?? "",
    );

    const selectedPlot = contact.plots.find((plot) => plot.id === selectedPlotId);
    const latestContract = selectedPlot?.latestContract ?? null;

    const contactType = contact.contactType;
    const isClient = contactType === CONTACT_TYPE.CLIENT;
    const isAgent = contactType === CONTACT_TYPE.SALES_AGENT;
    const isSupplier = contactType === CONTACT_TYPE.LAND_SELLER;
    const isVendor = !isClient && !isAgent && !isSupplier;
    const hasPlots = (contact.plots?.length ?? 0) > 0;

    const financials = useMemo(
        () => deriveContractFinancials(selectedPlot, latestContract),
        [selectedPlot, latestContract],
    );

    const projectName = selectedPlot?.project.projectName ?? "";

    const {
        statementDocument,
        letterDocument,
        statementFileName,
        letterFileName,
    } = useMemo(() => {
        const statementReferenceNumber = buildDocumentReferenceNumber(
            extra.companyName,
            projectName,
            contact.fullName,
            "STMT",
        );
        const letterReferenceNumber = buildDocumentReferenceNumber(
            extra.companyName,
            projectName,
            contact.fullName,
            "CONF",
        );
        const clientSlug = contact.fullName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");

        const statement = (
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
                    mobile:
                        formatInternationalWithSpaces(contact.mobileNumber ?? "") ?? "",
                    region:
                        `${contact.region ?? ""} ${contact.street ?? ""} ${contact.ward ?? ""}`.trim(),
                    projectLocation: `${projectName} - Plot No. ${selectedPlot?.plotNumber ?? ""}`,
                    plotSize: `Sqm ${financials.plotSize}`,
                    pricePerSqm: `Tshs. ${thousandSeparator(financials.pricePerSqm)} /Sqm`,
                    monthlyInstallment: `Tshs. ${thousandSeparator(financials.monthlyInstallment)}`,
                    duration: `${financials.duration}`,
                    salesAgent: latestContract?.salesAgent?.fullName ?? "—",
                }}
                statementDetails={{
                    contractValue: `Tshs. ${thousandSeparator(financials.contractValue)}`,
                    totalPayments: `Tshs. ${thousandSeparator(financials.totalPayments)}`,
                    projectName,
                    accountRep: latestContract?.salesAgent?.fullName ?? "—",
                    accountRepEmail: latestContract?.salesAgent?.email ?? "—",
                    currentBalance: `Tshs. ${thousandSeparator(financials.displayBalance)}`,
                }}
                invoices={{
                    payments: (latestContract?.payments ?? [])
                        .filter((payment) => payment.direction === "IN")
                        .map((payment) => ({...payment, amount: Number(payment.amount)})),
                    installments: financials.installmentsWithRunning.map(
                        (installment) => ({
                            ...installment,
                            amountDue: Number(installment.amountDue),
                            amountPaid: Number(installment.amountPaid),
                            runningTotal: installment.runningTotal ?? 0,
                        }),
                    ),
                }}
                footer={{
                    email: extra.branding.email,
                    address: extra.branding.address,
                    mobile: formatInternationalWithSpaces(
                        extra.branding.mobileNumber ?? "",
                    ),
                    website: extra.branding.website,
                }}
                footerNotes={
                    financials.fullyPaid
                        ? "Umekamilisha kulipa malipo yote. Asante kwa kuwa mteja wetu wa thamani."
                        : `Salio la mkataba wako ni Tshs. ${thousandSeparator(financials.displayBalance)}. Tafadhali fanya malipo kulipa kiasi kilichobakia kabla ya mkataba kuisha.`
                }
            />
        );

        const letter = latestContract ? (
            <ConfirmationLetterDocument
                companyName={extra.companyName}
                logoUrl={extra.logoUrl}
                primaryColor={extra.branding.primaryColor}
                referenceNumber={letterReferenceNumber}
                clientFullName={contact.fullName}
                projectName={projectName}
                plotNumber={selectedPlot?.plotNumber ?? ""}
                plotSize={financials.plotSize}
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
        ) : null;

        return {
            statementDocument: statement,
            letterDocument: letter,
            statementFileName: `statement-${clientSlug}-${statementReferenceNumber.replace(/\//g, "-")}.pdf`,
            letterFileName: `confirmation-${clientSlug}-${letterReferenceNumber.replace(/\//g, "-")}.pdf`,
        };
    }, [contact, extra, selectedPlot, projectName, latestContract, financials]);

    const plotSelector = useMemo(
        () => (
            <Select value={selectedPlotId} onValueChange={setSelectedPlotId}>
                <SelectTrigger>
                    <SelectValue placeholder="Select Plot/Contract"/>
                </SelectTrigger>
                <SelectContent>
                    {contact.plots.map((plot) => (
                        <SelectItem key={plot.id} value={plot.id}>
                            <span>{plot.project.projectName}</span> - Plot No.
                            <span>{plot.plotNumber}</span>
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        ),
        [contact.plots, selectedPlotId],
    );

    const horizontalTabs: HorizontalTabItem[] = useMemo(() => {
        const tabs: HorizontalTabItem[] = [
            {
                id: "personal-particulars",
                label: "Personal Particulars",
                icon: UserIcon,
                content: <PersonalParticularsContent contact={contact}/>,
            },
        ];

        const roleTab = (id: string, label: string, icon: LucideIcon) =>
            tabs.push({id, label, icon, content: <PlaceholderTabContent/>});

        if (hasPlots && isClient)
            tabs.push({
                id: "plots-held",
                label: "Plots Held",
                icon: MapPlusIcon,
                content: <PlotsHeldTabContent contact={contact}/>,
            });
        if (isSupplier)
            roleTab("supplier-projects", "Supplier Projects", MapPlusIcon);
        if (isAgent) {
            tabs.push({
                id: "commission-payments",
                label: "Commission Payments",
                icon: WalletIcon,
                content: <CommissionPaymentsTabContent contact={contact}/>,
            });
            // roleTab("client-portfolio", "Client Portfolio", BriefcaseBusinessIcon);
        }
        if (isVendor)
            roleTab("assignments", "Assignments/Jobs", BriefcaseBusinessIcon);

        return tabs;
    }, [contact, hasPlots, isClient, isSupplier, isAgent, isVendor]);

    const verticalTabs: VerticalTabItem[] = useMemo(() => {
        const tabs: VerticalTabItem[] = [
            {
                id: "overview",
                label: "Overview",
                icon: HouseIcon,
                content: (
                    <div className="rounded border-dashed min-h-122.5 mr-3 pl-6 py-1 mx-3">
                        <ContactHeader contact={contact}/>
                        <CustomTabsHorizontal
                            tabs={horizontalTabs}
                            defaultTab="personal-particulars"
                        />
                    </div>
                ),
            },
        ];

        const statementTab = (id: string, label: string) =>
            tabs.push({
                id,
                label,
                icon: FileText,
                content: (
                    <StatementTabContent
                        plotSelector={plotSelector}
                        document={statementDocument}
                        fileName={statementFileName}
                        hasContract={latestContract !== null}
                    />
                ),
            });

        if (hasPlots && isClient) {
            statementTab("client-statement", "Client Statement");
            tabs.push({
                id: "confirmation-letter",
                label: "Confirmation Letter",
                icon: FileCheck2,
                content: (
                    <ConfirmationLetterTabContent
                        plotSelector={plotSelector}
                        document={letterDocument}
                        fileName={letterFileName}
                        fullyPaid={financials.fullyPaid}
                    />
                ),
            });
        }

        if (isSupplier) statementTab("supplier-statement", "Supplier Statement");
        if (isVendor) statementTab("vendor-statement", "Vendor Statement");

        return tabs;
    }, [
        contact,
        horizontalTabs,
        hasPlots,
        isClient,
        isSupplier,
        isVendor,
        plotSelector,
        statementDocument,
        statementFileName,
        letterDocument,
        letterFileName,
        latestContract,
        financials.fullyPaid,
    ]);

    return (
        <div className="mt-4">
            <CustomTabsVertical
                defaultTab="overview"
                tabs={verticalTabs}
                skeletonTabCount={4}
                unstyled
            />
        </div>
    );
};