// Matches the real shape returned by `GET /api/contacts/:id/statement-data`
// (src/worker/routes/contacts.ts) — see
// docs/specs/0001-contacts-completion/0002-contact-view-and-detail-data.md.
// Every plot carries exactly one `latestContract` (or null), never a
// `contracts[]` array and never a separate `activeContract` field. A
// contract is a "bucket" that can hold more than one plot (see the schema's
// contractPlots table) — `latestContract.installments` here is always just
// THIS plot's own schedule, not the whole bucket's.

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
    projectId: string
    clientContactId: string
    createdBy: string | null
    status: "ACTIVE" | "DELINQUENT" | "COMPLETED" | "CANCELLED"
    startDate: string
    termMonths: number
    totalContractValue: string
    // This plot's own share of totalContractValue (contractPlots.allocatedValue)
    // — use this, not totalContractValue, for a single plot's balance/running-
    // total math. totalContractValue is the whole bucket (every plot combined);
    // see contract-balance.ts.
    allocatedValue: string
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
    // Bucket-wide — a payment isn't "for" one plot, only its allocations
    // are (see contractPaymentAllocations). Do not divide this by plot
    // count or compare it directly against a single plot's installments;
    // see contract-balance.ts for the balance/running-total implication.
    payments: ClientContactPayment[]
    // This plot's own schedule specifically (contractInstallments.plotId),
    // never the whole bucket's — see the file-level note above.
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
// carries what the Commission Payments tab needs (the plot(s)/project sold,
// which client bought it, and the payout schedule) rather than every field
// on the contract, since it's never rendered as a full contract record the
// way `ClientContactContract` is. `plots` can hold more than one entry — a
// contract is a bucket that can cover several plots (always within one
// project — see plotSaleContracts.projectId) — and only lists plots still
// live in the bucket (cancelled ones are dropped server-side).
export interface ClientContactAsAgentContract {
    id: string
    projectId: string
    clientContactId: string
    status: "ACTIVE" | "DELINQUENT" | "COMPLETED" | "CANCELLED"
    startDate: string
    totalContractValue: string
    commissionPercent: string
    commissionAmount: string
    commissionPayoutMonths: number
    project: ClientContactProject
    plots: {
        id: string
        plotNumber: string
        surveyedPlotNumber: string | null
    }[]
    client: {
        id: string
        fullName: string
    } | null
    commissionPayouts: ClientContactCommissionPayout[]
}

// A single dated cash payment (an `expenses` row) logged against either a
// project-acquisition installment or a vendor job. Shared by both the
// Supplier Projects and Assignments/Jobs sub-tables, mirroring how
// `ClientContactPayment` is shared across contract sub-tables.
export interface ClientContactExpensePayment {
    id: string
    amount: string
    paidAt: string
    method: string | null
    reference: string | null
}

export interface ClientContactAcquisitionInstallment {
    id: string
    acquisitionId: string
    installmentNo: number
    dueDate: string
    amountDue: string
    amountPaid: string
    status: "DUE" | "PARTIAL" | "PAID"
    paidAt: string | null
    payments: ClientContactExpensePayment[]
}

// A project purchase deal this contact sold as a LAND_SELLER. One row per
// deal, not per project — a project can be assembled from several parcels
// bought from different sellers (or the same seller) at different times, so
// this stays a proper one-to-many off the project rather than a single flat
// "the" acquisition. Powers the "Supplier Projects" tab.
export interface ClientContactAsSellerAcquisition {
    id: string
    projectId: string
    sellerContactId: string
    dealDate: string
    totalPurchaseValue: string
    paymentPlan: "CASH" | "INSTALLMENT"
    description: string | null
    project: {
        id: string
        projectName: string
    }
    installments: ClientContactAcquisitionInstallment[]
}

export interface ClientContactVendorJobProjectLink {
    id: string
    jobId: string
    projectId: string
    allocatedAmount: string
    project: {
        id: string
        projectName: string
    }
}

// A job/assignment given to this contact as a vendor (surveyor, auditor, ICT
// support, etc). Payments are logged against the job directly as they
// happen — there's no predefined payment schedule the way a plot sale
// contract or a project acquisition has. Powers the "Assignments/Jobs" tab.
export interface ClientContactVendorJob {
    id: string
    vendorContactId: string
    title: string
    description: string | null
    agreedAmount: string
    status: "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED"
    startDate: string | null
    dueDate: string | null
    completedAt: string | null
    cancelledAt: string | null
    createdAt: string | null
    payments: ClientContactExpensePayment[]
    projectLinks: ClientContactVendorJobProjectLink[]
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
    projectAcquisitionsAsSeller: ClientContactAsSellerAcquisition[]
    vendorJobs: ClientContactVendorJob[]
}