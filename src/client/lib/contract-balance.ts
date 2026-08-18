import type { ClientContactContract, ClientContactInstallment } from "@/types/contacts.ts"

// One shared formula used identically by the client statement (display) and
// the confirmation letter (fully-paid gate) — see docs/specs/0001-contacts-completion's
// "Fully paid balance rule".
export function computeTotalPaid(contract: Pick<ClientContactContract, "payments">): number {
  return contract.payments
    .filter((payment) => payment.direction === "IN")
    .reduce((sum, payment) => sum + parseFloat(payment.amount), 0)
}

export function computeContractBalance(contract: Pick<ClientContactContract, "totalContractValue" | "payments">): number {
  return Number(contract.totalContractValue) - computeTotalPaid(contract)
}

export function isContractFullyPaid(contract: Pick<ClientContactContract, "totalContractValue" | "payments"> | null | undefined): boolean {
  if (!contract) return false
  return computeContractBalance(contract) <= 0
}

// Each installment row's running total: the contract's remaining balance
// after that row's amountPaid is applied — total minus the cumulative
// amountPaid of that row and every prior row, in installmentNo order.
export function withRunningTotals(
  contract: Pick<ClientContactContract, "totalContractValue">,
  installments: ClientContactInstallment[]
): ClientContactInstallment[] {
  const total = Number(contract.totalContractValue)
  let cumulativePaid = 0
  return installments.map((installment) => {
    cumulativePaid += Number(installment.amountPaid)
    return { ...installment, runningTotal: total - cumulativePaid }
  })
}
