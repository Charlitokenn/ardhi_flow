import { z } from "zod"

// Sale contract maths shared by the Worker (what is stored) and the New
// Contract sheet (what is previewed), so the two can never disagree (AC-7).
// See docs/specs/0005-sales-contract-creation, Schedule and commission rules.
//
// Money is whole TZS held as plain integers. Dates are `YYYY-MM-DD` strings
// with no time zone maths: a due date is a calendar day, not an instant.

export const CONTRACT_MAX_PLOTS = 20
export const CONTRACT_MAX_TERM_MONTHS = 60
export const CONTRACT_START_WINDOW_DAYS = 365
// Upper bound on any shilling amount, so `amount × percent` stays well inside
// the safe integer range and rounding stays exact.
export const CONTRACT_MAX_AMOUNT = 1_000_000_000_000
// "Today" for the start date default and window, on both client and server.
export const CONTRACT_TIME_ZONE = "Africa/Dar_es_Salaam"

export const PURCHASE_PLANS = ["FLAT_RATE", "DOWNPAYMENT"] as const
export type PurchasePlan = (typeof PURCHASE_PLANS)[number]

// ── money ───────────────────────────────────────────────────────────────────

// round(amount × percent / 100), half up, for whole non negative inputs.
export function percentOf(amount: number, percent: number): number {
  return Math.floor((amount * percent + 50) / 100)
}

const DECIMAL_PATTERN = /^\d+(\.\d+)?$/

// The size a plot is sold on: surveyed when known, else unsurveyed.
export function plotSizeUsed(plot: { surveyedSize: string | null; unsurveyedSize: string }): {
  size: string
  basis: "SURVEYED" | "UNSURVEYED"
} {
  return plot.surveyedSize != null && plot.surveyedSize !== ""
    ? { size: plot.surveyedSize, basis: "SURVEYED" }
    : { size: plot.unsurveyedSize, basis: "UNSURVEYED" }
}

// round(size × rate), half up, in exact integer maths (sizes may carry
// decimals, rates are whole shillings). Null when either value isn't a
// plain non negative number.
export function listPrice(size: string, pricePerSqm: string | number): number | null {
  const rate = String(pricePerSqm).trim()
  const trimmedSize = size.trim()
  if (!/^\d+$/.test(rate) || !DECIMAL_PATTERN.test(trimmedSize)) return null
  const [whole, fraction = ""] = trimmedSize.split(".")
  const scaled = BigInt(whole + fraction) * BigInt(rate)
  const divisor = 10n ** BigInt(fraction.length)
  return Number((scaled * 2n + divisor) / (2n * divisor))
}

// ── dates ───────────────────────────────────────────────────────────────────

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function formatIsoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function parseIsoDate(value: string): { year: number; month: number; day: number } | null {
  const match = ISO_DATE_PATTERN.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null
  return { year, month, day }
}

export function isIsoDate(value: string): boolean {
  return parseIsoDate(value) !== null
}

// Same day of month `months` later, clamped to that month's last day
// (31 Jan + 1 month = 28 Feb, or 29 Feb in a leap year).
export function addMonthsClamped(date: string, months: number): string {
  const parsed = parseIsoDate(date)
  if (!parsed) throw new Error(`Invalid date: ${date}`)
  const index = parsed.month - 1 + months
  const year = parsed.year + Math.floor(index / 12)
  const month = (((index % 12) + 12) % 12) + 1
  return formatIsoDate(year, month, Math.min(parsed.day, daysInMonth(year, month)))
}

export function addDays(date: string, days: number): string {
  const parsed = parseIsoDate(date)
  if (!parsed) throw new Error(`Invalid date: ${date}`)
  const next = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days))
  return formatIsoDate(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate())
}

// First day of the month `months` after the date's month.
function monthStart(date: string, months: number): string {
  return addMonthsClamped(`${date.slice(0, 8)}01`, months)
}

export function todayInContractTimeZone(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CONTRACT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now)
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return formatIsoDate(part("year"), part("month"), part("day"))
}

// Inclusive bounds a start date must sit between (AC-5). ISO strings compare
// correctly as plain strings.
export function startDateWindow(today: string): { min: string; max: string } {
  return {
    min: addDays(today, -CONTRACT_START_WINDOW_DAYS),
    max: addDays(today, CONTRACT_START_WINDOW_DAYS),
  }
}

// ── request body (POST /api/contracts) ──────────────────────────────────────

const wholeNumber = (label: string, min: number, max: number) =>
  z
    .number({ error: `${label} is required` })
    .int(`${label} must be a whole number`)
    .min(min, `${label} must be at least ${min}`)
    .max(max, `${label} must be at most ${max}`)

// Shape and range checks only. The start date window, and everything that
// needs the database (plot prices, contact types), is checked by the route.
export const createContractBodySchema = z
  .object({
    // Made by the client when the sheet opens; the idempotency key (AC-13).
    id: z.string().uuid(),
    projectId: z.string().uuid("Pick a project"),
    clientContactId: z.string().uuid("Pick a client"),
    plots: z
      .array(
        z.object({
          plotId: z.string().uuid(),
          allocatedValue: wholeNumber("Agreed price", 1, CONTRACT_MAX_AMOUNT),
        }),
      )
      .min(1, "Pick at least one plot")
      .max(CONTRACT_MAX_PLOTS, `A contract holds at most ${CONTRACT_MAX_PLOTS} plots`),
    purchasePlan: z.enum(PURCHASE_PLANS, { error: "Pick a purchase plan" }),
    termMonths: wholeNumber("Term", 1, CONTRACT_MAX_TERM_MONTHS),
    startDate: z.string().refine(isIsoDate, "Enter a valid start date"),
    downpaymentPercent: wholeNumber("Downpayment percent", 1, 99).nullable().optional(),
    cancellationFeePercent: wholeNumber("Cancellation fee percent", 0, 100),
    salesAgentContactId: z.string().uuid().nullable().optional(),
    commissionPercent: wholeNumber("Commission percent", 0, 100).optional(),
    commissionPayoutMonths: wholeNumber("Payout months", 1, CONTRACT_MAX_TERM_MONTHS).optional(),
  })
  .superRefine((body, ctx) => {
    const seen = new Set<string>()
    body.plots.forEach((plot, index) => {
      if (seen.has(plot.plotId)) {
        ctx.addIssue({ code: "custom", path: ["plots", index, "plotId"], message: "This plot is already in the contract" })
      }
      seen.add(plot.plotId)
    })
    if (body.purchasePlan === "DOWNPAYMENT" && body.downpaymentPercent == null) {
      ctx.addIssue({ code: "custom", path: ["downpaymentPercent"], message: "Downpayment percent is required" })
    }
    // Commission fields only count when an agent is set (AC-6).
    if (body.salesAgentContactId) {
      if (body.commissionPercent == null) {
        ctx.addIssue({ code: "custom", path: ["commissionPercent"], message: "Commission percent is required" })
      }
      if (body.commissionPayoutMonths == null) {
        ctx.addIssue({ code: "custom", path: ["commissionPayoutMonths"], message: "Payout months is required" })
      } else if (body.commissionPayoutMonths > body.termMonths) {
        ctx.addIssue({
          code: "custom",
          path: ["commissionPayoutMonths"],
          message: "Payout months can't be more than the term",
        })
      }
    }
  })
export type CreateContractBody = z.infer<typeof createContractBodySchema>

// `{'plots.0.allocatedValue': 'message'}`, first message per field: the 422
// `fields` shape, and how the sheet keys its own errors (AC-11).
export function issuesToFields(issues: readonly { path: readonly PropertyKey[]; message: string }[]): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const issue of issues) {
    const key = issue.path.map(String).join(".") || "body"
    fields[key] ??= issue.message
  }
  return fields
}

// ── the plan ────────────────────────────────────────────────────────────────

export interface ContractPlanInput {
  purchasePlan: PurchasePlan
  termMonths: number
  startDate: string
  // Ignored for FLAT_RATE.
  downpaymentPercent: number | null
  plots: { plotId: string; allocatedValue: number }[]
  // Null when no sales agent is set.
  commission: { percent: number; payoutMonths: number } | null
}

export interface PlannedInstallment {
  // 0 is the downpayment (DOWNPAYMENT only).
  installmentNo: number
  dueDate: string
  amount: number
}

export interface PlannedPlot {
  plotId: string
  allocatedValue: number
  downpayment: number
  financed: number
  installments: PlannedInstallment[]
}

export interface PlannedTranche {
  trancheNumber: number
  amount: number
  targetMonth: string
}

// `path` uses the request body's field paths (`plots.0.allocatedValue`), so
// the route can return it as is and the sheet can put it next to the field.
export interface ContractPlanIssue {
  path: string
  message: string
}

export interface ContractPlan {
  plots: PlannedPlot[]
  totalContractValue: number
  downpaymentPercent: number | null
  downpaymentAmount: number
  financedAmount: number
  commissionPercent: number
  commissionAmount: number
  commissionPayoutMonths: number
  tranches: PlannedTranche[]
  // Empty when the plan can be stored. Never store a plan with issues.
  issues: ContractPlanIssue[]
}

// Pure: same input, same plan, on the Worker and in the browser.
export function buildContractPlan(input: ContractPlanInput): ContractPlan {
  const { purchasePlan, termMonths: term, startDate } = input
  const downpaymentPercent = purchasePlan === "DOWNPAYMENT" ? input.downpaymentPercent : null
  const issues: ContractPlanIssue[] = []
  const plotIssues: ContractPlanIssue[] = []

  const plots = input.plots.map((plot, index): PlannedPlot => {
    const price = plot.allocatedValue
    const downpayment = downpaymentPercent != null ? percentOf(price, downpaymentPercent) : 0
    const financed = price - downpayment
    const path = `plots.${index}.allocatedValue`

    if (downpaymentPercent != null && downpayment < 1) {
      plotIssues.push({ path, message: "The downpayment on this plot rounds to 0 shillings" })
    } else if (financed < term) {
      plotIssues.push({ path, message: `This price leaves an installment under 1 shilling over ${term} months` })
    }

    const installments: PlannedInstallment[] = []
    if (downpaymentPercent != null) {
      installments.push({ installmentNo: 0, dueDate: startDate, amount: downpayment })
    }
    const base = Math.floor(financed / term)
    for (let n = 1; n <= term; n++) {
      installments.push({
        installmentNo: n,
        dueDate: addMonthsClamped(startDate, n),
        amount: n === term ? financed - base * (term - 1) : base,
      })
    }
    return { plotId: plot.plotId, allocatedValue: price, downpayment, financed, installments }
  })

  if (downpaymentPercent != null && plots.length > 0 && plotIssues.length === plots.length) {
    issues.push({ path: "downpaymentPercent", message: "This downpayment leaves an installment under 1 shilling on every plot" })
  } else {
    issues.push(...plotIssues)
  }

  const totalContractValue = plots.reduce((sum, plot) => sum + plot.allocatedValue, 0)
  const downpaymentAmount = plots.reduce((sum, plot) => sum + plot.downpayment, 0)

  let commissionPercent = 0
  let commissionAmount = 0
  let commissionPayoutMonths = 1
  const tranches: PlannedTranche[] = []
  if (input.commission) {
    commissionPercent = input.commission.percent
    commissionPayoutMonths = input.commission.payoutMonths
    commissionAmount = percentOf(totalContractValue, commissionPercent)
    if (commissionPercent > 0 && commissionAmount < commissionPayoutMonths) {
      issues.push({
        path: "commissionPayoutMonths",
        message: `A commission of ${commissionAmount} shillings can't be split over ${commissionPayoutMonths} months`,
      })
    } else if (commissionAmount > 0) {
      const base = Math.floor(commissionAmount / commissionPayoutMonths)
      for (let n = 1; n <= commissionPayoutMonths; n++) {
        tranches.push({
          trancheNumber: n,
          amount: n === commissionPayoutMonths ? commissionAmount - base * (commissionPayoutMonths - 1) : base,
          targetMonth: monthStart(startDate, n - 1),
        })
      }
    }
  }

  return {
    plots,
    totalContractValue,
    downpaymentPercent,
    downpaymentAmount,
    financedAmount: totalContractValue - downpaymentAmount,
    commissionPercent,
    commissionAmount,
    commissionPayoutMonths,
    tranches,
    issues,
  }
}
