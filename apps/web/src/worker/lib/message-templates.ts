// Message templates: the due-items lookup and the render engine.
//
// See docs/specs/0002-message-templates for the full design. Kept here as
// plain, DB-agnostic functions (findDueItemsForContact takes a tenantDb and
// returns plain data; renderMessageTemplate takes plain data and returns a
// string) so the future NextSMS send-flow spec can reuse both directly
// instead of re-deriving the grouping logic.

import {and, eq, inArray, ne} from 'drizzle-orm'
import type {NeonHttpDatabase} from 'drizzle-orm/neon-http'
import * as schema from '../../../drizzle/tenant/schema'
import type {MessageTemplate} from '../../../drizzle/tenant/schema'

type TenantDb = NeonHttpDatabase<typeof schema>

// One line of "what's owed" in a rendered message — already grouped and
// formatted, ready to drop into a {dueItems} block.
export interface DueItemGroup {
    contractId: string
    installmentNo: number
    dueDate: string // 'YYYY-MM-DD', as stored
    amount: number // sum(amountDue - amountPaid - waivedAmount) across the group, floored at 0
    plotNumbers: string[] // e.g. ['4', '5'], ascending
    projectName: string
    daysOverdue?: number // PAST_DUE groups only
    daysRemaining?: number // UPCOMING groups only
}

// Same UTC-date-string pattern dashboard.ts already uses for its own overdue
// count (`new Date().toISOString().split('T')[0]`) — no per-tenant timezone
// handling exists anywhere in the codebase today, so this doesn't add any
// either. Exposed as a parameter (defaulting to "now") purely so tests can
// pin a fixed date.
export function todayDateString(now: Date = new Date()): string {
    return now.toISOString().split('T')[0]
}

function daysBetween(a: string, b: string): number {
    const msPerDay = 24 * 60 * 60 * 1000
    return Math.round((new Date(a).getTime() - new Date(b).getTime()) / msPerDay)
}

const UPCOMING_WINDOW_DAYS = 3 // matches the "Zimebakia siku 3" sample — see spec Follow-up

// Finds the installments that make one client's due-items block for one
// template's reminderTiming, already grouped and formatted.
//
// Contract scoping is `status IN ('ACTIVE', 'DELINQUENT')`, not `= 'ACTIVE'`
// — a contract moves to DELINQUENT on a missed installment (see
// dashboard.ts's own active-contract count), so requiring exactly ACTIVE
// would wrongly hide the very contracts a Past Due template needs to find.
//
// Installment scoping is `status != 'PAID'`, broader than dashboard.ts's own
// overdue count (`status = 'DUE'` only) — a PARTIAL installment past its due
// date still owes money and should still surface here.
export async function findDueItemsForContact(
    db: TenantDb,
    contactId: string,
    reminderTiming: 'UPCOMING' | 'DUE_TODAY' | 'PAST_DUE',
    today: string = todayDateString(),
): Promise<DueItemGroup[]> {
    const contracts = await db.query.plotSaleContracts.findMany({
        where: and(
            eq(schema.plotSaleContracts.clientContactId, contactId),
            inArray(schema.plotSaleContracts.status, ['ACTIVE', 'DELINQUENT']),
        ),
        with: {project: true},
    })
    if (contracts.length === 0) return []

    const contractIds = contracts.map((c) => c.id)
    const projectNameByContractId = new Map(contracts.map((c) => [c.id, c.project.projectName]))

    const installments = await db.query.contractInstallments.findMany({
        where: and(
            inArray(schema.contractInstallments.contractId, contractIds),
            ne(schema.contractInstallments.status, 'PAID'),
        ),
        with: {plot: true},
    })

    // Group by (contractId, installmentNo, dueDate) — this is what correctly
    // folds multiple plots on one contract into one line while still
    // splitting genuinely different installments or contracts into their
    // own lines. See spec Key invariants.
    const groups = new Map<
        string,
        {
            contractId: string
            installmentNo: number
            dueDate: string
            amount: number
            plotNumbers: string[]
        }
    >()

    for (const row of installments) {
        const dueDate = row.dueDate
        const matchesTiming =
            reminderTiming === 'PAST_DUE'
                ? dueDate < today
                : reminderTiming === 'DUE_TODAY'
                    ? dueDate === today
                    : dueDate > today && daysBetween(dueDate, today) <= UPCOMING_WINDOW_DAYS
        if (!matchesTiming) continue

        const key = `${row.contractId}::${row.installmentNo}::${dueDate}`
        const outstanding = Math.max(
            0,
            Number(row.amountDue) - Number(row.amountPaid) - Number(row.waivedAmount ?? 0),
        )

        const existing = groups.get(key)
        if (existing) {
            existing.amount += outstanding
            existing.plotNumbers.push(String(row.plot.plotNumber))
        } else {
            groups.set(key, {
                contractId: row.contractId,
                installmentNo: row.installmentNo,
                dueDate,
                amount: outstanding,
                plotNumbers: [String(row.plot.plotNumber)],
            })
        }
    }

    return Array.from(groups.values()).map((g) => {
        const base: DueItemGroup = {
            contractId: g.contractId,
            installmentNo: g.installmentNo,
            dueDate: g.dueDate,
            amount: g.amount,
            plotNumbers: g.plotNumbers.sort((a, b) => Number(a) - Number(b)),
            projectName: projectNameByContractId.get(g.contractId) ?? '',
        }
        if (reminderTiming === 'PAST_DUE') base.daysOverdue = daysBetween(today, g.dueDate)
        if (reminderTiming === 'UPCOMING') base.daysRemaining = daysBetween(g.dueDate, today)
        return base
    })
}

// Mirrors formatCurrency in src/client/lib/utils.ts (`Tshs. ${amount.toLocaleString('en-TZ')}`)
// — duplicated here since worker code can't import client files.
function formatAmount(amount: number): string {
    return `Tshs. ${amount.toLocaleString('en-TZ')}`
}

// The fixed, non-author-editable line format per reminderTiming. See spec
// Rationale for why this isn't a template-authored sub-template: the
// engineer chose guaranteed correctness (amount/plot/project always come
// from the database) over per-line wording flexibility.
function renderDueItemLine(item: DueItemGroup, reminderTiming: 'UPCOMING' | 'DUE_TODAY' | 'PAST_DUE'): string {
    const plots = item.plotNumbers.join(',')
    const amount = formatAmount(item.amount)
    switch (reminderTiming) {
        case 'PAST_DUE':
            return `Unakumbumbushwa kulipia rejesho namba ${item.installmentNo} la ${amount} kwa ajili ya plot namba: ${plots} mradi wa ${item.projectName}. Umechelewesha kulipa rejesho hili kwa siku ${item.daysOverdue}.`
        case 'DUE_TODAY':
            return `Unakumbumbushwa kulipia rejesho namba ${item.installmentNo} la ${amount} kwa ajili ya plot namba: ${plots} mradi wa ${item.projectName}. Leo ndo siku ya malipo ya rejesho hili.`
        case 'UPCOMING':
            return `Zimebakia siku ${item.daysRemaining} kufikia tarehe ya kulipa rejesho namba ${item.installmentNo} la ${amount} kwa ajili ya plot namba: ${plots} mradi wa ${item.projectName}.`
    }
}

export interface RenderResult {
    text: string
    charCount: number
    segmentCount: number
    dueItemsFound: number
}

const GSM_7_BASIC_CHARACTERS = new Set(Array.from(
    `@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ !"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà`,
))
const GSM_7_EXTENDED_CHARACTERS = new Set(['\f', '^', '{', '}', '\\', '[', '~', ']', '|', '€'])

// GSM-7 messages use 160 septets for one segment and 153 per concatenated
// segment. Characters from the extension table consume two septets. Any
// other character switches the whole message to UCS-2, whose limits are 70
// UTF-16 code units for one segment and 67 per concatenated segment.
export function computeSmsSegments(text: string): {charCount: number; segmentCount: number} {
    const characters = Array.from(text)
    const isGsm7 = characters.every(
        (character) => GSM_7_BASIC_CHARACTERS.has(character) || GSM_7_EXTENDED_CHARACTERS.has(character),
    )
    const charCount = isGsm7
        ? characters.reduce(
            (count, character) => count + (GSM_7_EXTENDED_CHARACTERS.has(character) ? 2 : 1),
            0,
        )
        : text.length
    if (charCount === 0) return {charCount, segmentCount: 0}

    const singleSegmentLimit = isGsm7 ? 160 : 70
    const concatenatedSegmentLimit = isGsm7 ? 153 : 67
    if (charCount <= singleSegmentLimit) return {charCount, segmentCount: 1}
    return {charCount, segmentCount: Math.ceil(charCount / concatenatedSegmentLimit)}
}

// Fills in a template's tokens: {firstName}, {dueItems}, {totalAmount}.
// A template with no {dueItems} token (thank you / marketing / general /
// custom) simply never has it substituted — dueItems can be an empty array
// in that case.
export function renderMessageTemplate(
    template: Pick<MessageTemplate, 'body' | 'reminderTiming'>,
    params: {firstName: string; dueItems: DueItemGroup[]},
): RenderResult {
    let text = template.body

    if (text.includes('{dueItems}')) {
        const lines = params.dueItems.length === 0
            ? 'Nothing due for this reminder timing.'
            : params.dueItems
                .map((item) => renderDueItemLine(item, template.reminderTiming as 'UPCOMING' | 'DUE_TODAY' | 'PAST_DUE'))
                .join(' ')
        text = text.replaceAll('{dueItems}', lines)
    }
    if (text.includes('{totalAmount}')) {
        const total = params.dueItems.reduce((sum, item) => sum + item.amount, 0)
        text = text.replaceAll('{totalAmount}', formatAmount(total))
    }
    text = text.replaceAll('{firstName}', params.firstName)

    const {charCount, segmentCount} = computeSmsSegments(text)
    return {text, charCount, segmentCount, dueItemsFound: params.dueItems.length}
}
