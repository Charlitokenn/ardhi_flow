// Turns a campaign's saved audience rules into the exact list of messages to
// send. Shared by the audience preview and the send endpoint, so what staff
// see before sending is what goes out. See docs/specs/0004-sms-send-flow,
// "Send pipeline" step 2 and AC-6 to AC-9.

import {and, asc, eq, inArray} from 'drizzle-orm'
import {
    normaliseTzMobile,
    OPT_OUT_CAMPAIGN_TYPES,
    type SmsAudience,
    type SmsCampaignType,
    type SmsSkipped,
    type SmsSkipReason,
} from '@ardhiflow/shared-schema'
import {contacts} from '../../../drizzle/tenant/schema'
import type {TenantDb} from './tenant-db'
import {
    computeSmsSegments,
    type DueItemGroup,
    findDueItemsForContacts,
    firstNameOf,
    hasPersonalTokens,
    isGsm7Text,
    renderMessageTemplate,
    todayDateString,
} from './message-templates'

// Longest message NextSMS accepts.
const MAX_GSM_SEGMENTS = 15
const MAX_UNICODE_SEGMENTS = 10

export interface AudienceRecipient {
    contactId: string
    name: string
    phone: string // bare 255XXXXXXXXX
    text: string // exactly what this person receives
    segments: number
}

export interface AudienceSkip {
    contactId: string
    name: string
    reason: SmsSkipReason
}

export interface ResolvedAudience {
    recipients: AudienceRecipient[]
    skipped: AudienceSkip[]
    skippedCounts: SmsSkipped
    totalSegments: number
    // 'single': the body has no per client tokens, so every recipient gets the
    // same text and chunks go to /text/single (which also avoids NextSMS's 24
    // hour duplicate refusal across chunks). 'multi': personalised, /text/multi.
    sendMode: 'single' | 'multi'
}

type ContactRow = {
    id: string
    fullName: string
    mobileNumber: string | null
    altMobileNumber: string | null
    smsOptOut: boolean
}

const contactColumns = {
    id: true,
    fullName: true,
    mobileNumber: true,
    altMobileNumber: true,
    smsOptOut: true,
} as const

// Live clients only: anything else (sellers, staff, deleted rows) never
// receives a campaign, even when added by hand.
const liveClient = and(eq(contacts.contactType, 'CLIENT'), eq(contacts.isDeleted, false))

export async function resolveAudience(
    db: TenantDb,
    campaign: {type: SmsCampaignType; templateBody: string; audience: SmsAudience},
    today: string = todayDateString(),
): Promise<ResolvedAudience> {
    const {audience, templateBody} = campaign
    const timing = audience.reminderTiming

    // 1. The segment, oldest first (createdAt, then id) so the order, and so
    // which of two contacts sharing a number wins, never changes between runs.
    const segmentRows: ContactRow[] = await db.query.contacts.findMany({
        where: liveClient,
        columns: contactColumns,
        orderBy: [asc(contacts.createdAt), asc(contacts.id)],
    })

    // 2. Hand added contacts, in the order they were added. Unknown, deleted
    // or non client ids are dropped silently.
    const inSegment = new Set(segmentRows.map((row) => row.id))
    const extraIds = [...new Set(audience.includeContactIds)].filter((id) => !inSegment.has(id))
    const extraRows: ContactRow[] = extraIds.length
        ? await db.query.contacts.findMany({
            where: and(liveClient, inArray(contacts.id, extraIds)),
            columns: contactColumns,
        })
        : []
    const rowById = new Map([...segmentRows, ...extraRows].map((row) => [row.id, row]))

    // Due items once for everyone who might need them (2 queries in total).
    const usesDueItems = templateBody.includes('{dueItems}') || templateBody.includes('{totalAmount}')
    const needsDueItems = timing !== null && (usesDueItems || audience.segment === 'DUE')
    const allIds = [...segmentRows.map((row) => row.id), ...extraRows.map((row) => row.id)]
    const dueByContact: Map<string, DueItemGroup[]> = needsDueItems
        ? await findDueItemsForContacts(db, allIds, timing, today)
        : new Map()
    const dueFor = (id: string) => dueByContact.get(id) ?? []

    // The DUE segment is the clients with at least one due group for the timing.
    const fromSegment = audience.segment === 'DUE'
        ? segmentRows.filter((row) => dueFor(row.id).length > 0)
        : segmentRows
    // Hand added means "not already in the segment after its DUE filter": a
    // client added to a reminder who owes nothing must still reach the rules
    // below, so they show up as skipped for "nothing due" (AC-8).
    const inFilteredSegment = new Set(fromSegment.map((row) => row.id))
    const fromHand = [...new Set(audience.includeContactIds)]
        .filter((id) => !inFilteredSegment.has(id))
        .map((id) => rowById.get(id))
        .filter((row): row is ContactRow => !!row)

    // 3. Drop the hand removed ones.
    const excluded = new Set(audience.excludeContactIds)
    const candidates = [...fromSegment, ...fromHand].filter((row) => !excluded.has(row.id))

    // 4. The AC-8 rules, in order.
    const optOutApplies = OPT_OUT_CAMPAIGN_TYPES.includes(campaign.type)
    const requiresDueItems = templateBody.includes('{dueItems}')
    const usedNumbers = new Set<string>()
    const recipients: AudienceRecipient[] = []
    const skipped: AudienceSkip[] = []
    const skippedCounts: SmsSkipped = {optedOut: 0, nothingDue: 0, noValidNumber: 0, duplicateNumber: 0, tooLong: 0}
    const skip = (row: ContactRow, reason: SmsSkipReason) => {
        skipped.push({contactId: row.id, name: row.fullName, reason})
        skippedCounts[reason] += 1
    }

    for (const row of candidates) {
        if (optOutApplies && row.smsOptOut) {
            skip(row, 'optedOut')
            continue
        }
        // Checked before rendering, so "Nothing due for this reminder timing."
        // is never sent to anyone.
        const dueItems = dueFor(row.id)
        if (requiresDueItems && dueItems.length === 0) {
            skip(row, 'nothingDue')
            continue
        }
        const phone = normaliseTzMobile(row.mobileNumber) ?? normaliseTzMobile(row.altMobileNumber)
        if (!phone) {
            skip(row, 'noValidNumber')
            continue
        }
        // The alternate number is not tried for a duplicate: one person
        // receiving two copies is the thing this rule prevents.
        if (usedNumbers.has(phone)) {
            skip(row, 'duplicateNumber')
            continue
        }

        const {text} = renderMessageTemplate(
            {body: templateBody, reminderTiming: timing},
            {firstName: firstNameOf(row.fullName), dueItems},
        )
        const {segmentCount} = computeSmsSegments(text)
        const limit = isGsm7Text(text) ? MAX_GSM_SEGMENTS : MAX_UNICODE_SEGMENTS
        if (text.trim() === '' || segmentCount > limit) {
            skip(row, 'tooLong')
            continue
        }

        usedNumbers.add(phone)
        recipients.push({contactId: row.id, name: row.fullName, phone, text, segments: segmentCount})
    }

    return {
        recipients,
        skipped,
        skippedCounts,
        totalSegments: recipients.reduce((sum, r) => sum + r.segments, 0),
        sendMode: hasPersonalTokens(templateBody) ? 'multi' : 'single',
    }
}
