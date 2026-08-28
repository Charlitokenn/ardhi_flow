// Matches the real shape returned by `GET /api/projects/:id/statement-data`
// (src/worker/routes/projects.ts) — mirrors the `ClientContact*` shapes in
// `types/contacts.ts`, one level down (a project's plots + the LAND_ACQUISITION
// payments made against it) rather than a contact's.

export interface ClientProjectContact {
    id: string
    fullName: string
}

export interface ClientProjectPlot {
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
    // The contact currently holding this plot (buyer on the active
    // contract), or null for an unsold AVAILABLE plot.
    contact: ClientProjectContact | null
}

export interface ClientProjectAcquisition {
    id: string
    projectId: string
    sellerContactId: string
    dealDate: string
    totalPurchaseValue: string
    paymentPlan: "CASH" | "INSTALLMENT"
    description: string | null
}

// A single dated cash payment (an `expenses` row, category LAND_ACQUISITION)
// made against this project — same shape as `ClientContactExpensePayment`
// plus who was paid, since the Project Payments tab needs the supplier name
// inline rather than looking it up via an installment/acquisition chain.
export interface ClientProjectExpensePayment {
    id: string
    amount: string
    paidAt: string
    method: string | null
    reference: string | null
    payee: ClientProjectContact | null
    // Added client side (see lib/project-balance.ts) — the project's
    // remaining acquisition balance after this row's amount is applied, not
    // stored server side.
    runningTotal?: number
}

export interface ClientProject {
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
    committmentAmount: string | null
    lgaFee: string | null
    street: string | null
    tpNumber: string | null
    tpStatus: string | null
    surveyStatus: string | null
    surveyNumber: string | null
    mwenyekitiName: string | null
    mwenyekitiMobile: string | null
    mtendajiName: string | null
    mtendajiMobile: string | null
    numberOfPlots: number
    isDeleted: boolean
    createdAt: string | null
    updatedAt: string | null
    plots: ClientProjectPlot[]
    acquisitions: ClientProjectAcquisition[]
    // Every LAND_ACQUISITION expense logged directly against this project —
    // powers the "Project Payments" tab.
    payments: ClientProjectExpensePayment[]
}
