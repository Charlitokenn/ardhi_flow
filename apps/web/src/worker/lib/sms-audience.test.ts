import {beforeEach, describe, expect, it, vi} from 'vitest'
import type {DueItemGroup} from './message-templates'
import type {TenantDb} from './tenant-db'

// The audience rules run for real, with the real renderer. Only the tenant
// database (the system boundary) and the due items lookup are stubbed.
const dueItems = vi.hoisted(() => new Map<string, unknown[]>())
vi.mock('./message-templates', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./message-templates')>()
    return {
        ...actual,
        findDueItemsForContacts: vi.fn(async (_db: unknown, ids: string[]) =>
            new Map(ids.map((id) => [id, dueItems.get(id) ?? []]))),
    }
})

const {resolveAudience} = await import('./sms-audience')

const PAST_DUE_BODY = 'Habari {firstName}, {dueItems} Tafadhari fanya malipo kuepuka tozo za adhabu au kuvunjwa kwa mkataba.'
const TODAY = '2026-10-27'

const client = (id: string, fullName: string, mobileNumber: string) =>
    ({id, fullName, mobileNumber, altMobileNumber: null, smsOptOut: false})
const ASHA = client('a', 'Asha Mdoe', '0712000001')
const JOHN = client('b', 'John Juma', '0712000002')

const overdue: DueItemGroup = {
    contractId: 'c1',
    installmentNo: 3,
    dueDate: '2026-10-25',
    amount: 340000,
    plotNumbers: ['4'],
    projectName: 'Kigamboni Greens',
    daysOverdue: 2,
}

// Every live client comes back for the segment query; hand added ids that are
// live clients are already among them.
function fakeDb(rows: ReturnType<typeof client>[]): TenantDb {
    return {query: {contacts: {findMany: vi.fn(async () => rows)}}} as unknown as TenantDb
}

const pastDueReminder = (includeContactIds: string[]) => ({
    type: 'PAYMENT_REMINDER' as const,
    templateBody: PAST_DUE_BODY,
    audience: {segment: 'DUE' as const, reminderTiming: 'PAST_DUE' as const, includeContactIds, excludeContactIds: []},
})

describe('resolveAudience, hand added clients in a DUE audience (AC-8)', () => {
    beforeEach(() => {
        dueItems.clear()
        dueItems.set(ASHA.id, [overdue])
    })

    it('skips a hand added client who owes nothing as "nothing due" instead of dropping them', async () => {
        const result = await resolveAudience(fakeDb([ASHA, JOHN]), pastDueReminder([JOHN.id]), TODAY)

        expect(result.recipients.map((r) => r.contactId)).toEqual([ASHA.id])
        expect(result.skipped).toEqual([{contactId: JOHN.id, name: JOHN.fullName, reason: 'nothingDue'}])
        expect(result.skippedCounts.nothingDue).toBe(1)
    })

    it('keeps a hand added client who is already due in their segment place, once', async () => {
        dueItems.set(JOHN.id, [overdue])

        const result = await resolveAudience(fakeDb([ASHA, JOHN]), pastDueReminder([JOHN.id]), TODAY)

        expect(result.recipients.map((r) => r.contactId)).toEqual([ASHA.id, JOHN.id])
        expect(result.skipped).toEqual([])
    })
})
