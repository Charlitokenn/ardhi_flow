import * as React from "react";
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
import {formatInternationalWithSpaces, thousandSeparator, toProperCase,} from "@/lib/utils";
import {ClientStatementDocument} from "@/components/forms/contacts/client-statement.tsx";
import {ConfirmationLetterDocument} from "@/components/forms/contacts/confirmation-letter.tsx";
import {PDFDownloadLink, PDFViewer} from "@react-pdf/renderer";
import {ImportIcon} from "@/assets/icons";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue,} from "@/components/ui/select";
import type {ClientContact} from "@/types/contacts.ts";
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

export const ViewContactForm = ({
                                    contact,
                                    extra,
                                }: {
    contact: ClientContact;
    extra: DocumentBrandingExtra;
}) => {
    const [selectedPlotId, setSelectedPlotId] = React.useState<string>(
        contact?.plots?.[0]?.id ?? "",
    );
    const selectedPlot = contact?.plots?.find(
        (plot) => plot.id === selectedPlotId,
    );
    const latestContract = selectedPlot?.latestContract ?? null;

    const tabsData: VerticalTabItem[] = React.useMemo(() => {
        const plotsCount = contact?.plots?.length ?? 0;
        const hasPlots = plotsCount > 0;
        const isClient = contact?.contactType === "CLIENT";
        const isAgent = contact?.contactType === "SALES_AGENT";
        const isSupplier = contact?.contactType === "LAND_SELLER";
        const isVendor = !["SALES_AGENT", "CLIENT", "LAND_SELLER"].includes(
            contact?.contactType ?? "",
        );

        const plotSizeRaw =
            selectedPlot?.surveyedSize ?? selectedPlot?.unsurveyedSize ?? "0";
        const plotSize = thousandSeparator(Number(plotSizeRaw));

        const duration = latestContract?.termMonths ?? 0;
        const contractValue = latestContract
            ? Number(latestContract.totalContractValue)
            : 0;
        const pricePerSqm =
            Number(plotSizeRaw) > 0 ? contractValue / Number(plotSizeRaw) : 0;
        const totalPayments = latestContract ? computeTotalPaid(latestContract) : 0;
        const balance = latestContract ? computeContractBalance(latestContract) : 0;
        const displayBalance = Math.max(balance, 0);
        const fullyPaid = isContractFullyPaid(latestContract);

        const installmentsWithRunning = latestContract
            ? withRunningTotals(latestContract, latestContract.installments)
            : [];

        // Monthly installment, per the contract's own purchase plan. For the
        // DOWNPAYMENT plan, use the contract's own financedAmount (already
        // totalContractValue minus downpaymentAmount) rather than re-deriving
        // it from downpaymentPercent, which is stored as a whole number
        // (e.g. 20 meaning 20%), not a 0-1 fraction.
        const monthlyInstallment = (() => {
            if (!latestContract) return 0;
            const total = Number(latestContract.totalContractValue);
            const months = latestContract.termMonths;
            if (!months) return 0;
            if (latestContract.purchasePlan === "FLAT_RATE") return total / months;
            if (months > 1) {
                return Number(latestContract.financedAmount) / (months - 1);
            }
            return 0;
        })();

        const salesAgentName = latestContract?.salesAgent?.fullName ?? "—";
        const salesAgentEmail = latestContract?.salesAgent?.email ?? "—";

        const projectName = selectedPlot?.project.projectName ?? "";
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
        const statementFileName = `statement-${clientSlug}-${statementReferenceNumber.replace(/\//g, "-")}.pdf`;
        const letterFileName = `confirmation-${clientSlug}-${letterReferenceNumber.replace(/\//g, "-")}.pdf`;

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
                    mobile:
                        formatInternationalWithSpaces(contact.mobileNumber ?? "") ?? "",
                    region:
                        `${contact.region ?? ""} ${contact.street ?? ""} ${contact.ward ?? ""}`.trim(),
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
                    mobile: formatInternationalWithSpaces(
                        extra.branding.mobileNumber ?? "",
                    ),
                    website: extra.branding.website,
                }}
                footerNotes={
                    fullyPaid
                        ? "Umekamilisha kulipa malipo yote. Asante kwa kuwa mteja wetu wa thamani."
                        : `Salio la mkataba wako ni Tshs. ${thousandSeparator(displayBalance)}. Tafadhali fanya malipo kulipa kiasi kilichobakia kabla ya mkataba kuisha.`
                }
            />
        );

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
        );

        const plotSelector = (
            <Select value={selectedPlotId} onValueChange={setSelectedPlotId}>
                <SelectTrigger>
                    <SelectValue placeholder="Select Plot/Contract"/>
                </SelectTrigger>
                <SelectContent>
                    {contact.plots.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                            <span>{item.project.projectName}</span> - Plot No.
                            <span>{item.plotNumber}</span>
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        );

        const horizontalTabs: HorizontalTabItem[] = [
            {
                id: "tab-1",
                label: "Personal Particulars",
                icon: UserIcon,
                content: (
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
                                    <div className="flex min-w-0 flex-col gap-1.5">
                                        <dt className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                                            <ShieldCheck className="size-3.5"/> ID Number
                                        </dt>
                                        <dd className="flex min-w-0 items-center gap-2 text-sm font-medium">
                      <span className="truncate">
                        {contact.idNumber || "—"}
                      </span>
                                        </dd>
                                    </div>
                                </dl>
                            </ContactSection>
                        </div>
                        <ContactSection title="Next of Keen Contacts">
                            <div className="grid gap-6 md:grid-cols-2">
                                {[
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
                                ].map((emergency) => (
                                    <div
                                        key={emergency.label}
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
                                                    {emergency.label}
                                                </p>
                                                <p className="truncate text-sm font-semibold">
                                                    {emergency.name || "Not provided"}
                                                </p>
                                            </div>
                                        </div>
                                        <dl className="grid gap-3 sm:grid-cols-2">
                                            <DetailItem
                                                label="Relationship"
                                                value={emergency.relationship}
                                            />
                                            <DetailItem
                                                label="Mobile"
                                                value={emergency.mobile}
                                                href={
                                                    emergency.mobile
                                                        ? `tel:${emergency.mobile}`
                                                        : undefined
                                                }
                                                icon={<Phone className="size-3.5"/>}
                                            />
                                        </dl>
                                    </div>
                                ))}
                            </div>
                        </ContactSection>
                    </div>
                ),
            },
        ];

        if (hasPlots && isClient) {
            horizontalTabs.push({
                id: "tab-2",
                label: "Plots Held",
                icon: MapPlusIcon,
                content: (
                    <>
                        Manage your personal{" "}
                        <span className="text-foreground font-semibold">
              account details
            </span>
                        . Keep everything up to date so we can serve you better.
                    </>
                ),
            });
        }

        if (isSupplier) {
            horizontalTabs.push({
                id: "tab-3",
                label: "Supplier Projects",
                icon: MapPlusIcon,
                content: (
                    <>
                        Manage your Projects{" "}
                        <span className="text-foreground font-semibold">
              account details
            </span>
                        . Keep everything up to date so we can serve you better.
                    </>
                ),
            });
        }

        if (isAgent) {
            horizontalTabs.push({
                id: "tab-4",
                label: "Commission Payments",
                icon: WalletIcon,
                content: (
                    <>
                        Manage your Commissions{" "}
                        <span className="text-foreground font-semibold">
              account details
            </span>
                        . Keep everything up to date so we can serve you better.
                    </>
                ),
            });
            horizontalTabs.push({
                id: "tab-5",
                label: "Client Portfolio",
                icon: BriefcaseBusinessIcon,
                content: (
                    <>
                        Manage your Commissions{" "}
                        <span className="text-foreground font-semibold">
              account details
            </span>
                        . Keep everything up to date so we can serve you better.
                    </>
                ),
            });
        }

        if (isVendor) {
            horizontalTabs.push({
                id: "tab-6",
                label: "Assignments/Jobs",
                icon: BriefcaseBusinessIcon,
                content: (
                    <>
                        Manage your Commissions{" "}
                        <span className="text-foreground font-semibold">
              account details
            </span>
                        . Keep everything up to date so we can serve you better.
                    </>
                ),
            });
        }

        const verticalTabs: VerticalTabItem[] = [
            {
                id: "tab-1",
                label: "Overview",
                icon: HouseIcon,
                content: (
                    <div className="rounded border-dashed min-h-122.5 mr-3 pl-6 py-1 mx-3">
                        <div className="flex items-center gap-3 mb-8">
                            <Avatar size="lg">
                                <AvatarImage src={contact.clientPhoto ?? undefined} alt=""/>
                                <AvatarFallback>PP</AvatarFallback>
                                <AvatarBadge>
                                    <UserIcon/>
                                </AvatarBadge>
                            </Avatar>
                            <div className="min-w-0 ">
                                <div className="flex justify-between">
                                    <div className="flex min-w-0 items-center gap-2">
                                        <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
                                            {contact.fullName}
                                        </h1>
                                        <Badge variant="secondary" className="text-xs">
                                            {toProperCase(contact.contactType?.replace("_", " "))}
                                        </Badge>
                                    </div>
                                    {/*<LabelNumberTicker value={contact.plots.length}/>*/}
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
                                            {contact.mobileNumber && (
                                                <span className="hidden sm:inline text-border" aria-hidden="true">
                    ·
                </span>
                                            )}

                                            <a
                                                href={`mailto:${contact.email}`}
                                                className="inline-flex min-w-0 items-center gap-1.5 hover:text-foreground"
                                            >
                                                <Mail className="size-3.5 shrink-0"/>
                                                <span className="truncate break-all">{contact.email}</span>
                                            </a>
                                        </>
                                    )}

                                    {(contact.region ||
                                        contact.district ||
                                        contact.ward ||
                                        contact.street) && (
                                        <>
                                            {(contact.mobileNumber || contact.email) && (
                                                <span className="hidden sm:inline text-border" aria-hidden="true">
                    ·
                </span>
                                            )}

                                            <span className="inline-flex min-w-0 items-center gap-1.5">
                <MapPlusIcon className="size-3.5 shrink-0"/>

                <span className="truncate">
                    {[
                        contact.region,
                        contact.district,
                        contact.ward,
                        contact.street,
                    ]
                        .filter(Boolean)
                        .map(toProperCase)
                        .join(", ")}
                </span>
            </span>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                        <CustomTabsHorizontal tabs={horizontalTabs}/>
                    </div>
                ),
            },
        ];

        if (hasPlots && isClient) {
            verticalTabs.push({
                id: "tab-2",
                label: "Client Statement",
                icon: FileText,
                content: (
                    <div className="rounded border-dashed min-h-122.5 mr-3 pl-6 py-1 mx-3">
                        <div className="flex justify-between gap-2 mb-2">
                            {plotSelector}
                            <PDFDownloadLink
                                document={statementDocument}
                                fileName={statementFileName}
                            >
                                {({loading}) =>
                                    loading ? (
                                        <span className="text-sm">Loading document...</span>
                                    ) : (
                                        <span className="flex text-sm">
                      <ImportIcon className="size-5"/> Download Statement
                    </span>
                                    )
                                }
                            </PDFDownloadLink>
                        </div>
                        {latestContract ? (
                            <PDFViewer
                                width="100%"
                                height={480}
                                showToolbar={false}
                                className="rounded-lg"
                            >
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
            });

            verticalTabs.push({
                id: "tab-3",
                label: "Confirmation Letter",
                icon: FileCheck2,
                content: (
                    <div className="rounded border-dashed min-h-122.5 mr-3 pl-6 py-1 mx-3">
                        <div className="flex justify-between gap-2 mb-2">
                            {plotSelector}
                            {fullyPaid && letterDocument ? (
                                <PDFDownloadLink
                                    document={letterDocument}
                                    fileName={letterFileName}
                                >
                                    {({loading}) =>
                                        loading ? (
                                            <span className="text-sm">Preparing...</span>
                                        ) : (
                                            <span className="flex text-sm">
                        <ImportIcon className="size-5"/> Download Letter
                      </span>
                                        )
                                    }
                                </PDFDownloadLink>
                            ) : (
                                <span className="flex text-sm cursor-not-allowed">
                  <ImportIcon className="size-5"/> Download Letter
                </span>
                            )}
                        </div>
                        {fullyPaid && letterDocument ? (
                            <PDFViewer
                                width="100%"
                                height={480}
                                showToolbar={false}
                                className="rounded-lg"
                            >
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
            });
        }

        if (isSupplier) {
            verticalTabs.push({
                id: "tab-4",
                label: "Supplier Statement",
                icon: FileText,
                content: (
                    <div className="rounded border-dashed min-h-122.5 mr-3 pl-6 py-1 mx-3">
                        <div className="flex justify-between gap-2 mb-2">
                            {plotSelector}
                            <PDFDownloadLink
                                document={statementDocument}
                                fileName={statementFileName}
                            >
                                {({loading}) =>
                                    loading ? (
                                        <span className="text-sm">Loading document...</span>
                                    ) : (
                                        <span className="flex text-sm">
                      <ImportIcon className="size-5"/> Download Statement
                    </span>
                                    )
                                }
                            </PDFDownloadLink>
                        </div>
                        {latestContract ? (
                            <PDFViewer
                                width="100%"
                                height={480}
                                showToolbar={false}
                                className="rounded-lg"
                            >
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
            });
        }

        if (isVendor) {
            verticalTabs.push({
                id: "tab-5",
                label: "Vendor Statement",
                icon: FileText,
                content: (
                    <div className="rounded border-dashed min-h-122.5 mr-3 pl-6 py-1 mx-3">
                        <div className="flex justify-between gap-2 mb-2">
                            {plotSelector}
                            <PDFDownloadLink
                                document={statementDocument}
                                fileName={statementFileName}
                            >
                                {({loading}) =>
                                    loading ? (
                                        <span className="text-sm">Loading document...</span>
                                    ) : (
                                        <span className="flex text-sm">
                      <ImportIcon className="size-5"/> Download Statement
                    </span>
                                    )
                                }
                            </PDFDownloadLink>
                        </div>
                        {latestContract ? (
                            <PDFViewer
                                width="100%"
                                height={480}
                                showToolbar={false}
                                className="rounded-lg"
                            >
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
            });
        }

        return verticalTabs;
    }, [contact, extra, selectedPlot, selectedPlotId, latestContract]);

    return (
        <div className="mt-4">
            <CustomTabsVertical
                defaultTab="tab-1"
                tabs={tabsData}
                skeletonTabCount={4}
                unstyled
            />
        </div>
    );
};
