import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getGreeting(): string {
  const hour = new Date().getHours()

  if (hour < 12) {
    return "Morning "
  }

  if (hour < 18) {
    return "Afternoon "
  }

  return "Evening "
}

import { differenceInDays, subDays, subMonths, startOfMonth, endOfMonth } from "date-fns"
import type { DateRange } from "react-day-picker"

export const formatCurrency = (amount: number): string => {
  return `Tshs. ${amount.toLocaleString("en-TZ")}`
}

export const formatCompactCurrency = (amount: number): string => {
  if (amount >= 1_000_000_000) {
    return `Tshs. ${(amount / 1_000_000_000).toFixed(1)}B`
  }
  if (amount >= 1_000_000) {
    return `Tshs. ${(amount / 1_000_000).toFixed(1)}M`
  }
  if (amount >= 1_000) {
    return `Tshs. ${(amount / 1_000).toFixed(1)}K`
  }
  return `Tshs. ${amount}`
}

export const calculatePreviousPeriod = (range: DateRange): DateRange => {
  if (!range.from || !range.to) return range

  const days = differenceInDays(range.to, range.from)

  // If range starts on the 1st and spans roughly a full month, compare previous calendar month
  if (range.from.getDate() === 1 && days >= 27 && days <= 31) {
    const prevMonthStart = startOfMonth(subMonths(range.from, 1))
    const prevMonthEnd = endOfMonth(subMonths(range.from, 1))
    return { from: prevMonthStart, to: prevMonthEnd }
  }

  // Otherwise shift back by the same duration
  const prevTo = subDays(range.from, 1)
  const prevFrom = subDays(prevTo, days)
  return { from: prevFrom, to: prevTo }
}

export const isDateInRange = (date: Date, range: DateRange): boolean => {
  if (!range.from || !range.to) return true
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const from = new Date(range.from.getFullYear(), range.from.getMonth(), range.from.getDate())
  const to = new Date(range.to.getFullYear(), range.to.getMonth(), range.to.getDate())
  return d >= from && d <= to
}