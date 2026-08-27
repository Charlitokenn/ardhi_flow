import type { ClientProject, ClientProjectExpensePayment } from "@/types/projects.ts"

// A project's target acquisition cost — what all the payments in the
// "Project Payments" tab are being measured against. Prefers the sum of its
// `projectAcquisitions.totalPurchaseValue` rows (the current, multi-deal
// model) and falls back to the legacy single `acquisitionValue` snapshot on
// the project itself when no acquisition deals have been recorded yet. See
// the comment above `projects.acquisitionValue` in the schema.
export function computeProjectAcquisitionTarget(
  project: Pick<ClientProject, "acquisitionValue" | "acquisitions">
): number {
  const acquisitionsTotal = project.acquisitions.reduce(
    (sum, acquisition) => sum + Number(acquisition.totalPurchaseValue),
    0
  )
  return acquisitionsTotal > 0 ? acquisitionsTotal : Number(project.acquisitionValue)
}

export function computeTotalPaid(payments: Pick<ClientProjectExpensePayment, "amount">[]): number {
  return payments.reduce((sum, payment) => sum + Number(payment.amount), 0)
}

// Each payment row's running total: the project's remaining acquisition
// balance after that row's amount is applied — target minus the cumulative
// amount of that row and every prior row, in the given (chronological)
// order. The last row's `runningTotal` is the "Outstanding Amount" shown in
// the grid's footer.
export function withProjectPaymentRunningTotals(
  target: number,
  payments: ClientProjectExpensePayment[]
): ClientProjectExpensePayment[] {
  let cumulativePaid = 0
  return payments.map((payment) => {
    cumulativePaid += Number(payment.amount)
    return { ...payment, runningTotal: target - cumulativePaid }
  })
}
