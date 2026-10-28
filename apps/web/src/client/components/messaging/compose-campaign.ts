import type {ReminderTiming, SmsAudience, SmsCampaignType} from "@ardhiflow/shared-schema"

// What the compose flow edits. An SMS campaign saved as a draft maps onto
// POST/PATCH /api/campaigns (docs/specs/0004-sms-send-flow); `type` is the
// preview channel, and WhatsApp stays a preview only.
export interface ComposeCampaign {
    id: string | null // set once the draft has been saved
    type: "sms" | "whatsapp"
    name: string
    title: string // WhatsApp preview header only
    message: string
    smsType: SmsCampaignType
    templateId: string | null
    templateName: string | null
    // Frozen from the template when it is picked; the server re-derives it on save.
    reminderTiming: ReminderTiming | null
    audience: SmsAudience
}

export const EMPTY_AUDIENCE: SmsAudience = {
    segment: "ALL_CLIENTS",
    reminderTiming: null,
    includeContactIds: [],
    excludeContactIds: [],
}

export function emptyCampaign(): ComposeCampaign {
    return {
        id: null,
        type: "sms",
        name: "",
        title: "",
        message: "",
        smsType: "GENERAL",
        templateId: null,
        templateName: null,
        reminderTiming: null,
        audience: EMPTY_AUDIENCE,
    }
}

// A DRAFT row from GET /api/campaigns, reopened in the compose flow.
export interface DraftRow {
    id: string
    name: string
    type: string
    templateId: string | null
    templateBody: string
    audience: SmsAudience
}

export function campaignFromDraft(row: DraftRow): ComposeCampaign {
    return {
        ...emptyCampaign(),
        id: row.id,
        name: row.name,
        message: row.templateBody,
        smsType: row.type as SmsCampaignType,
        templateId: row.templateId,
        reminderTiming: row.audience.reminderTiming,
        audience: row.audience,
    }
}

export const SMS_TYPE_LABELS: Record<SmsCampaignType, string> = {
    PAYMENT_REMINDER: "Payment reminder",
    OVERDUE_NOTICE: "Overdue notice",
    FULLY_PAID_THANKYOU: "Thank you",
    MARKETING: "Marketing",
    GENERAL: "General",
    CUSTOM: "Custom",
}

export const TIMING_LABELS: Record<ReminderTiming, string> = {
    PAST_DUE: "past due",
    DUE_TODAY: "due today",
    UPCOMING: "upcoming",
}

// Keeps the audience consistent with the template: the timing is always the
// template's, and the "due installments" segment only exists with one.
export function normaliseCampaign(campaign: ComposeCampaign): ComposeCampaign {
    const reminderTiming = campaign.templateId ? campaign.reminderTiming : null
    const segment = reminderTiming ? campaign.audience.segment : "ALL_CLIENTS"
    if (
        reminderTiming === campaign.reminderTiming
        && reminderTiming === campaign.audience.reminderTiming
        && segment === campaign.audience.segment
    ) {
        return campaign
    }
    return {...campaign, reminderTiming, audience: {...campaign.audience, reminderTiming, segment}}
}
