// lib/table-filters.ts
import { type DateRange } from "react-day-picker"

export function matchesDateRange(date: Date | undefined | null, range?: DateRange): boolean {
    // If no filter is set, everything matches
    if (!range?.from && !range?.to) return true

    // If the row has no date, it cannot match any range filter
    if (!date) return false

    const time = date.getTime()
    const from = range.from?.getTime()
    const to = range.to?.getTime()

    return (!from || time >= from) && (!to || time <= to)
}