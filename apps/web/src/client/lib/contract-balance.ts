import type { ClientContactContract, ClientContactInstallment } from "@ardhiflow/shared-schema"

// A contract is a "bucket" that can hold more than one plot (see the
// schema's contractPlots table). `ClientContactContract.installments` is
// always scoped to one specific plot (never the whole bucket — see
// types/contacts.ts), so balance/running-total math has to be measured
// against that plot's own share of the deal (`allocatedValue`), not the
// bucket-wide `totalContractValue` — and against that plot's own
// installments' amountPaid, not the bucket-wide `payments` log (a single
// payment can be split across several plots' installments via
// contractPaymentAllocations, so raw payments overstate what's gone
// toward any one plot). `payments` on ClientContactContract is still the
// right field for an actual "payments received" list/history — just not
// for this math.

// One shared formula used identically by the client statement (display) and
// the confirmation letter (fully-paid gate) — see docs/specs/0001-contacts-completion's
// "Fully paid balance rule".
export function computeTotalPaid(contract: Pick<ClientContactContract, "installments">): number {
  return contract.installments.reduce((sum, installment) => sum + Number(installment.amountPaid), 0)
}

export function computeContractBalance(contract: Pick<ClientContactContract, "allocatedValue" | "installments">): number {
  return Number(contract.allocatedValue) - computeTotalPaid(contract)
}

export function isContractFullyPaid(contract: Pick<ClientContactContract, "allocatedValue" | "installments"> | null | undefined): boolean {
  if (!contract) return false
  return computeContractBalance(contract) <= 0
}

// Each installment row's running total: this plot's remaining balance
// after that row's amountPaid is applied — allocatedValue minus the
// cumulative amountPaid of that row and every prior row, in installmentNo
// order.
export function withRunningTotals(
  contract: Pick<ClientContactContract, "allocatedValue">,
  installments: ClientContactInstallment[]
): ClientContactInstallment[] {
  const total = Number(contract.allocatedValue)
  let cumulativePaid = 0
  return installments.map((installment) => {
    cumulativePaid += Number(installment.amountPaid)
    return { ...installment, runningTotal: total - cumulativePaid }
  })
}
