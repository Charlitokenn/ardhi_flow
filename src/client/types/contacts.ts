// Matches the real shape returned by `GET /api/contacts/:id/statement-data`
// (src/worker/routes/contacts.ts) — see
// docs/specs/0001-contacts-completion/0002-contact-view-and-detail-data.md.
// Every plot carries exactly one `latestContract` (or null), never a
// `contracts[]` array and never a separate `activeContract` field.

export interface ClientContactSalesAgent {
    id: string
    fullName: string
    email: string | null
}

export interface ClientContactPayment {
    id: string
    contractId: string
    clientContactId: string
    accountId: string | null
    direction: "IN" | "OUT"
    amount: string
    receivedAt: string
    method: string | null
    reference: string | null
    createdBy: string | null
    createdAt: string | null
}

export interface ClientContactInstallment {
    id: string
    contractId: string
    installmentNo: number
    originalDueDate: string
    dueDate: string
    rescheduledCount: number
    amountDue: string
    amountPaid: string
    penaltyAmount: string
    waivedAmount: string
    status: "DUE" | "PARTIAL" | "PAID"
    paidAt: string | null
    createdAt: string | null
    updatedAt: string | null
    // Added client side (see 0003 AC-6) — the contract's remaining balance
    // after this row's amountPaid is applied, not stored server side.
    runningTotal?: number
}

export interface ClientContactContract {
    id: string
    plotId: string
    clientContactId: string
    createdBy: string | null
    status: "ACTIVE" | "DELINQUENT" | "COMPLETED" | "CANCELLED"
    startDate: string
    termMonths: number
    totalContractValue: string
    purchasePlan: "FLAT_RATE" | "DOWNPAYMENT"
    downpaymentPercent: string | null
    downpaymentAmount: string
    financedAmount: string
    cancellationFeePercent: string
    graceDays: number
    delinquentDaysThreshold: number
    delinquentSince: string | null
    salesAgentContactId: string | null
    commissionPercent: string
    commissionAmount: string
    commissionPayoutMonths: number
    completedAt: string | null
    cancelledAt: string | null
    cancelledBy: string | null
    cancellationFeeAmount: string | null
    refundedAmount: string | null
    cancellationReason: string | null
    createdAt: string | null
    updatedAt: string | null
    payments: ClientContactPayment[]
    installments: ClientContactInstallment[]
    salesAgent: ClientContactSalesAgent | null
}

export interface ClientContactProject {
    id: string
    projectName: string
    projectDetails: string | null
    acquisitionDate: string
    sqmBought: string | null
    acquisitionValue: string
    region: string | null
    district: string | null
    ward: string | null
    projectOwner: string | null
    street: string | null
    tpNumber: string | null
    tpStatus: string | null
    surveyStatus: string | null
    surveyNumber: string | null
    numberOfPlots: number
    isDeleted: boolean
    createdAt: string | null
    updatedAt: string | null
}

export interface ClientContactPlot {
    id: string
    plotNumber: string
    surveyedPlotNumber: string | null
    availability: "AVAILABLE" | "SOLD"
    activeContractId: string | null
    unsurveyedSize: string
    surveyedSize: string | null
    projectId: string
    contactId: string | null
    isDeleted: boolean
    createdAt: string | null
    updatedAt: string | null
    project: ClientContactProject
    latestContract: ClientContactContract | null
}

export interface ClientContactCommissionPayout {
    id: string
    contractId: string
    salesAgentContactId: string
    trancheNumber: number
    amount: string
    targetMonth: string
    status: "PENDING" | "PAID" | "CANCELLED"
    triggeringPaymentId: string | null
    paidAt: string | null
    paidMonth: string | null
    createdAt: string | null
    updatedAt: string | null
}

// A contract this contact earns commission on, as the sales agent rather
// than the buyer. Deliberately narrower than `ClientContactContract` — it
// carries what the Commission Payments tab needs (the plot/project sold,
// which client bought it, and the payout schedule) rather than every field
// on the contract, since it's never rendered as a full contract record the
// way `ClientContactContract` is.
export interface ClientContactAsAgentContract {
    id: string
    plotId: string
    clientContactId: string
    status: "ACTIVE" | "DELINQUENT" | "COMPLETED" | "CANCELLED"
    startDate: string
    totalContractValue: string
    commissionPercent: string
    commissionAmount: string
    commissionPayoutMonths: number
    plot: {
        id: string
        plotNumber: string
        surveyedPlotNumber: string | null
        project: ClientContactProject
    }
    client: {
        id: string
        fullName: string
    } | null
    commissionPayouts: ClientContactCommissionPayout[]
}

export interface ClientContact {
    id: string
    fullName: string
    mobileNumber: string | null
    altMobileNumber: string | null
    email: string | null
    gender: "MALE" | "FEMALE" | null
    contactType: "CLIENT" | "LAND_SELLER" | "AUDITOR" | "ICT_SUPPORT" | "SURVEYOR" | "SALES_AGENT" | null
    idType: string | null
    idNumber: string | null
    region: string | null
    district: string | null
    ward: string | null
    street: string | null
    firstNOKName: string | null
    firstNOKMobile: string | null
    firstNOKRelationship: string | null
    secondNOKName: string | null
    secondNOKMobile: string | null
    secondNOKRelationship: string | null
    clientPhoto: string | null
    addedBy: string | null
    smsOptOut: boolean
    clerkUserId: string | null
    isDeleted: boolean
    createdAt: string | null
    updatedAt: string | null
    plots: ClientContactPlot[]
    plotSaleContractsAsAgent: ClientContactAsAgentContract[]
}