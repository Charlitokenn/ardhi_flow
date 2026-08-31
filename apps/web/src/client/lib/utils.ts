import {type ClassValue, clsx} from "clsx"
import {twMerge} from "tailwind-merge"
import {differenceInDays, endOfMonth, format, startOfMonth, subDays, subMonths} from "date-fns"
import type {DateRange} from "react-day-picker"

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
        return {from: prevMonthStart, to: prevMonthEnd}
    }

    // Otherwise shift back by the same duration
    const prevTo = subDays(range.from, 1)
    const prevFrom = subDays(prevTo, days)
    return {from: prevFrom, to: prevTo}
}

export const isDateInRange = (date: Date, range: DateRange): boolean => {
    if (!range.from || !range.to) return true
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    const from = new Date(range.from.getFullYear(), range.from.getMonth(), range.from.getDate())
    const to = new Date(range.to.getFullYear(), range.to.getMonth(), range.to.getDate())
    return d >= from && d <= to
}

export function formatMobileNumber(raw: string | null | undefined): string | null {
    if (!raw) return null

    // Strip everything except digits and the leading '+'
    const cleaned = raw.trim().replace(/[^\d+]/g, "")

    // Extract digits only
    const digits = cleaned.replace(/\D/g, "")

    // Tanzanian numbers: 12 digits starting with 255, or 10 digits starting with 0/6/7
    let normalized: string

    if (digits.length === 12 && digits.startsWith("255")) {
        normalized = digits
    } else if (digits.length === 10 && (digits.startsWith("0") || digits.startsWith("6") || digits.startsWith("7"))) {
        normalized = "255" + digits.slice(1) // replace leading 0 with 255
    } else if (digits.length === 9 && (digits.startsWith("6") || digits.startsWith("7"))) {
        normalized = "255" + digits
    } else {
        return null // unrecognized format
    }

    // Format as +255 XXX XXX XXX
    return `+${normalized.slice(0, 3)} ${normalized.slice(3, 6)} ${normalized.slice(6, 9)} ${normalized.slice(9)}`
}

export const addSpacesBeforeCapitals = (input: string): string => {
    return input.replace(/(?!^)([A-Z])/g, ' $1')
}


export function getTimeBasedGreeting(date: Date = new Date()): string {
    const hour = date.getHours();

    if (hour >= 1 && hour < 12) {
        return "Morning";
    } else if (hour >= 12 && hour < 17) {
        return "Afternoon";
    } else {
        return "Evening";
    }
}

/**
 * Gets a full greeting message with a name
 * @param firstName - The person's first name
 * @param date - Optional date to check. Defaults to current time.
 * @returns A personalized greeting message
 */
export function getPersonalizedGreeting(firstName: string | null | undefined, date: Date = new Date()): string {
    const timeGreeting = getTimeBasedGreeting(date);
    const name = firstName || "there";
    return `${timeGreeting}, ${name}`;
}


export const toProperCase = (text: string | null | undefined) => {
    if (!text) return ''
    return text.replace(
        /\w\S*/g,
        (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
}

export const getNameInitials = (name: string, count = 2) => {
    const initials = name
        .split(' ')
        .map((n) => n[0])
        .join('')
    const filtered = initials.replace(/[^a-zA-Z]/g, '')
    return filtered.slice(0, count).toUpperCase()
}

export function getInitials(name: string) {
    return name
        .trim()
        .split(/\s+/) // Split by one or more whitespace characters
        .filter((word) => word.length > 0) // Remove empty strings
        .map((word) => word.charAt(0).toUpperCase())
        .join('')
}

export const currencyNumber = (value: number, options?: Intl.NumberFormatOptions) => {
    if (typeof Intl === 'object' && Intl && typeof Intl.NumberFormat === 'function') {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'TZS',
            minimumFractionDigits: 0, // Ensures no decimal places
            maximumFractionDigits: 0, // Ensures no decimal places
            ...options
        }).format(value)
    }

    return `TZS ${value.toLocaleString('en-US')}`
}

export const thousandSeparator = (value: number, options?: Intl.NumberFormatOptions) => {
    if (typeof Intl == 'object' && Intl && typeof Intl.NumberFormat == 'function') {
        return new Intl.NumberFormat('en-US', {
            useGrouping: true, // Enable thousand separator
            ...options
        }).format(value)
    }

    return value.toString()
}

export const getLastLetter = (word: string): string => {
    return word.length > 0 ? word[word.length - 1] : ''
}

export const formatDateTime = (isoString: string): string => {
    const date = new Date(isoString)
    const options: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }

    // Use 'en-US' for English month names
    return new Intl.DateTimeFormat('en-US', options).format(date)
    // .replace(",", ""); // Remove comma after day
}

export function formatDate(date: string) {
    const d = new Date(date)
    const monthNames = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec'
    ]
    return `${monthNames[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

/** e.g. "Aug 12, 2026 11:23 PM" — short month + no-leading-zero day/hour, no
 *  comma before the time. Used wherever the exact time (not just the day)
 *  matters, like comment/event timestamps. */
export function formatDateTimeShort(date: string | Date): string {
    const d = typeof date === "string" ? new Date(date) : date
    if (Number.isNaN(d.getTime())) return "—"
    return format(d, "MMM d, yyyy h:mm a")
}

export function timeUntil(targetDate: string | Date): string {
    const MS_PER_DAY = 86400000 // 1000 * 60 * 60 * 24
    const DAYS_IN_MONTH = 30

    const today = new Date()
    const future = new Date(targetDate)

    // Reset time to midnight for accurate comparison
    today.setHours(0, 0, 0, 0)
    future.setHours(0, 0, 0, 0)

    const diffDays = Math.max(0, Math.ceil((future.getTime() - today.getTime()) / MS_PER_DAY))

    return diffDays > DAYS_IN_MONTH
        ? `${Math.floor(diffDays / DAYS_IN_MONTH)} month${diffDays >= 60 ? 's' : ''}`
        : `${diffDays} day${diffDays === 1 ? '' : 's'}`
}

export const timestampToDateString = (timestamp: string): string => {
    const date = new Date(parseInt(timestamp))
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function formatInternationalWithSpaces(input: string): string | null {
    if (!input) return null

    // Remove everything except digits
    const digits = input.replace(/\D+/g, '')

    // E.164 max length is 15 digits
    if (digits.length < 8 || digits.length > 15) return null

    // Add +
    const withPlus = `+${digits}`

    // Validate E.164
    if (!/^\+[1-9]\d{7,14}$/.test(withPlus)) return null

    // Add spaces: +CCC XXX XXX XXXX (best-effort)
    return withPlus.replace(/^\+(\d{1,3})(\d{3})(\d{3})(\d+)$/, '+$1 $2 $3 $4')
}