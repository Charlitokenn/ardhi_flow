// Matches the real shape returned by `GET /api/commissions`
// (src/worker/routes/commissions.ts). Every plot-sale contract that has a
// sales agent attached, org-wide — not scoped to one contact. Deliberately
// the same shape as `ClientContactAsAgentContract` (see types/contacts.ts,
// which powers the Commission Payments tab on a single contact) plus
// `salesAgent`, since this feeds the org-wide Commissions grid where every
// row needs to say whose commission it is.

import type {ClientContactCommissionPayout} from "./contacts.ts"

export interface CommissionContractRow {
    id: string
    projectId: string
    clientContactId: string
    status: "ACTIVE" | "DELINQUENT" | "COMPLETED" | "CANCELLED"
    startDate: string
    totalContractValue: string
    commissionPercent: string
    commissionAmount: string
    commissionPayoutMonths: number
    project: {
        id: string
        projectName: string
    }
    // A contract can cover more than one plot (always within one project —
    // see plotSaleContracts.projectId) — only plots still live in the
    // bucket (cancelled ones are dropped server-side).
    plots: {
        id: string
        plotNumber: string
        surveyedPlotNumber: string | null
    }[]
    client: {
        id: string
        fullName: string
    } | null
    salesAgent: {
        id: string
        fullName: string
    } | null
    commissionPayouts: ClientContactCommissionPayout[]
}
