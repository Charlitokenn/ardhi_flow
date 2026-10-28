import { z } from "zod"

// Tanzanian mobile number handling shared by the client (display) and the
// Worker (sending), so both agree on which numbers NextSMS can reach.
// See docs/specs/0004-sms-send-flow, Value sourcing (phone).

// Tanzanian mobiles only: 255, then 6 or 7, then 8 digits. Landlines are not
// accepted, because an SMS to them can't be delivered.
export const TZ_MOBILE_PATTERN = /^255[67]\d{8}$/

// Returns the bare `255XXXXXXXXX` form NextSMS expects, or null when the
// input isn't a Tanzanian mobile. Strips spaces, dashes, brackets and `+`,
// drops a leading international `00`, and maps the local forms
// `0XXXXXXXXX` and `XXXXXXXXX` to `255XXXXXXXXX`.
export function normaliseTzMobile(raw: string | null | undefined): string | null {
  if (!raw) return null
  let digits = raw.trim().replace(/[\s\-().+]/g, "")
  if (!/^\d+$/.test(digits)) return null
  if (digits.startsWith("00")) digits = digits.slice(2)

  let normalised: string
  if (digits.length === 12) normalised = digits
  else if (digits.length === 10 && digits.startsWith("0")) normalised = "255" + digits.slice(1)
  else if (digits.length === 9) normalised = "255" + digits
  else return null

  return TZ_MOBILE_PATTERN.test(normalised) ? normalised : null
}

// ── campaigns (docs/specs/0004-sms-send-flow) ───────────────────────────────


export const SMS_CAMPAIGN_TYPES = [
  "PAYMENT_REMINDER",
  "OVERDUE_NOTICE",
  "FULLY_PAID_THANKYOU",
  "MARKETING",
  "GENERAL",
  "CUSTOM",
] as const
export type SmsCampaignType = (typeof SMS_CAMPAIGN_TYPES)[number]

// Opted out contacts are skipped only for these types (AC-8). Reminders and
// thank yous still reach them.
export const OPT_OUT_CAMPAIGN_TYPES: readonly SmsCampaignType[] = ["MARKETING", "GENERAL", "CUSTOM"]

export const REMINDER_TIMINGS = ["UPCOMING", "DUE_TODAY", "PAST_DUE"] as const
export type ReminderTiming = (typeof REMINDER_TIMINGS)[number]

// The audience rules a draft stores (never the resolved list). Every read
// goes through this schema with defaults, so campaigns saved before spec 0004
// (with `{}`) still parse.
export const smsAudienceSchema = z.object({
  segment: z.enum(["ALL_CLIENTS", "DUE"]).default("ALL_CLIENTS"),
  // Frozen copy of the template's timing. Required when segment is DUE.
  reminderTiming: z.enum(REMINDER_TIMINGS).nullable().default(null),
  includeContactIds: z.array(z.string().uuid()).max(5000).default([]),
  excludeContactIds: z.array(z.string().uuid()).max(5000).default([]),
})
export type SmsAudience = z.infer<typeof smsAudienceSchema>

export const SMS_SKIP_REASONS = ["optedOut", "nothingDue", "noValidNumber", "duplicateNumber", "tooLong"] as const
export type SmsSkipReason = (typeof SMS_SKIP_REASONS)[number]

export const smsSkippedSchema = z.object({
  optedOut: z.number().int().default(0),
  nothingDue: z.number().int().default(0),
  noValidNumber: z.number().int().default(0),
  duplicateNumber: z.number().int().default(0),
  tooLong: z.number().int().default(0),
})
export type SmsSkipped = z.infer<typeof smsSkippedSchema>

export const SMS_SKIP_REASON_LABELS: Record<SmsSkipReason, string> = {
  optedOut: "Opted out",
  nothingDue: "Nothing due",
  noValidNumber: "No valid number",
  duplicateNumber: "Duplicate number",
  tooLong: "Message too long",
}

// POST /api/campaigns and POST /api/campaigns/audience-preview. PATCH takes
// any subset of it.
export const smsCampaignInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.enum(SMS_CAMPAIGN_TYPES),
  templateId: z.string().uuid().nullable().optional(),
  templateBody: z.string().trim().min(1).max(5000),
  audience: smsAudienceSchema.default({
    segment: "ALL_CLIENTS",
    reminderTiming: null,
    includeContactIds: [],
    excludeContactIds: [],
  }),
})
export type SmsCampaignInput = z.infer<typeof smsCampaignInputSchema>
