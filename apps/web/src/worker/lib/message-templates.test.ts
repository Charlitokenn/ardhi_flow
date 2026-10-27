import {describe, expect, it, vi} from 'vitest'
import {PgDialect} from 'drizzle-orm/pg-core'
import type {SQL} from 'drizzle-orm'
import {
    computeSmsSegments,
    type DueItemGroup,
    findDueItemsForContact,
    renderMessageTemplate,
    SAMPLE_FIRST_NAME,
    sampleDueItems,
    todayDateString,
} from './message-templates'

// Pure functions are called for real. findDueItemsForContact only has its
// tenant database stubbed (the system boundary); the SQL it builds is read
// back through Drizzle's own dialect so the scoping rules stay checked.

const PAST_DUE_BODY = 'Habari {firstName}, {dueItems} Tafadhari fanya malipo kuepuka tozo za adhabu au kuvunjwa kwa mkataba.'
const AC2_SAMPLE = 'Habari James, Unakumbumbushwa kulipia rejesho namba 3 la Tshs. 340,000 kwa ajili ya plot namba: 4,5 mradi wa Kigamboni Greens. Umechelewesha kulipa rejesho hili kwa siku 2. Tafadhari fanya malipo kuepuka tozo za adhabu au kuvunjwa kwa mkataba.'
const TODAY = '2026-10-27'

const group = (overrides: Partial<DueItemGroup> = {}): DueItemGroup => ({
    contractId: 'c1',
    installmentNo: 3,
    dueDate: '2026-10-25',
    amount: 340000,
    plotNumbers: ['4', '5'],
    projectName: 'Kigamboni Greens',
    daysOverdue: 2,
    ...overrides,
})

describe('renderMessageTemplate', () => {
    it('reproduces the AC-2 Past Due sample byte for byte (AC-2)', () => {
        const result = renderMessageTemplate(
            {body: PAST_DUE_BODY, reminderTiming: 'PAST_DUE'},
            {firstName: 'James', dueItems: [group()]},
        )

        expect(result).toEqual({text: AC2_SAMPLE, charCount: 243, segmentCount: 2, dueItemsFound: 1})
    })

    it('uses the Due Today line, which names no day count', () => {
        const {text} = renderMessageTemplate(
            {body: '{dueItems}', reminderTiming: 'DUE_TODAY'},
            {firstName: 'James', dueItems: [group({daysOverdue: undefined})]},
        )

        expect(text).toBe('Unakumbumbushwa kulipia rejesho namba 3 la Tshs. 340,000 kwa ajili ya plot namba: 4,5 mradi wa Kigamboni Greens. Leo ndo siku ya malipo ya rejesho hili.')
    })

    it('uses the Upcoming line with the days remaining', () => {
        const {text} = renderMessageTemplate(
            {body: '{dueItems}', reminderTiming: 'UPCOMING'},
            {firstName: 'James', dueItems: [group({daysOverdue: undefined, daysRemaining: 3})]},
        )

        expect(text).toBe('Zimebakia siku 3 kufikia tarehe ya kulipa rejesho namba 3 la Tshs. 340,000 kwa ajili ya plot namba: 4,5 mradi wa Kigamboni Greens.')
    })

    it('combines several due groups into one message, one line each (AC-6)', () => {
        const result = renderMessageTemplate(
            {body: PAST_DUE_BODY, reminderTiming: 'PAST_DUE'},
            {
                firstName: 'Fatuma',
                dueItems: [
                    group(),
                    group({contractId: 'c2', installmentNo: 1, plotNumbers: ['2'], projectName: 'Mbweni Heights', amount: 500000, daysOverdue: 5}),
                ],
            },
        )

        expect(result.dueItemsFound).toBe(2)
        expect(result.text.match(/Unakumbumbushwa/g)).toHaveLength(2)
        expect(result.text).toContain('plot namba: 4,5 mradi wa Kigamboni Greens. Umechelewesha kulipa rejesho hili kwa siku 2. Unakumbumbushwa')
        expect(result.text).toContain('plot namba: 2 mradi wa Mbweni Heights. Umechelewesha kulipa rejesho hili kwa siku 5.')
        expect(result.text.startsWith('Habari Fatuma, ')).toBe(true)
    })

    it('fills only the tokens a non reminder body contains (AC-8)', () => {
        const result = renderMessageTemplate(
            {body: 'Asante {firstName} kwa kuwa nasi.', reminderTiming: null},
            {firstName: 'Said', dueItems: []},
        )

        expect(result).toEqual({text: 'Asante Said kwa kuwa nasi.', charCount: 26, segmentCount: 1, dueItemsFound: 0})
    })

    it('shows a clear nothing due line instead of an empty block (AC-11)', () => {
        const {text, dueItemsFound} = renderMessageTemplate(
            {body: 'Habari {firstName}, {dueItems} Asante.', reminderTiming: 'UPCOMING'},
            {firstName: 'Said', dueItems: []},
        )

        expect(text).toBe('Habari Said, Nothing due for this reminder timing. Asante.')
        expect(dueItemsFound).toBe(0)
    })

    it('sums every due line into {totalAmount}', () => {
        const {text} = renderMessageTemplate(
            {body: 'Jumla {totalAmount}', reminderTiming: 'PAST_DUE'},
            {firstName: 'x', dueItems: [group({amount: 250000}), group({contractId: 'c2', amount: 1250000})]},
        )

        expect(text).toBe('Jumla Tshs. 1,500,000')
    })

    it('shows Tshs. 0 for {totalAmount} when nothing is due', () => {
        const {text} = renderMessageTemplate({body: '{totalAmount}', reminderTiming: null}, {firstName: 'x', dueItems: []})

        expect(text).toBe('Tshs. 0')
    })

    it('replaces every occurrence of a token and leaves unknown tokens as written', () => {
        const {text} = renderMessageTemplate(
            {body: '{firstName} {firstName} {lastName}', reminderTiming: null},
            {firstName: 'Asha', dueItems: []},
        )

        expect(text).toBe('Asha Asha {lastName}')
    })
})

describe('computeSmsSegments', () => {
    it.each([
        ['an empty body', '', 0, 0],
        ['160 plain characters', 'a'.repeat(160), 160, 1],
        ['161 plain characters', 'a'.repeat(161), 161, 2],
        ['306 plain characters, two full concatenated segments', 'a'.repeat(306), 306, 2],
        ['307 plain characters', 'a'.repeat(307), 307, 3],
    ])('counts %s', (_label, text, charCount, segmentCount) => {
        expect(computeSmsSegments(text)).toEqual({charCount, segmentCount})
    })

    it('counts each GSM 7 extension character as two', () => {
        expect(computeSmsSegments('{}[]€')).toEqual({charCount: 10, segmentCount: 1})
    })

    it('pushes a message over 160 when extension characters double up', () => {
        expect(computeSmsSegments('a'.repeat(159) + '€')).toEqual({charCount: 161, segmentCount: 2})
    })

    it('switches to the UCS-2 limits of 70 and 67 when any character is outside GSM 7', () => {
        expect(computeSmsSegments('😀' + 'a'.repeat(68))).toEqual({charCount: 70, segmentCount: 1})
        expect(computeSmsSegments('😀' + 'a'.repeat(69))).toEqual({charCount: 71, segmentCount: 2})
    })
})

describe('sampleDueItems (the fixed sample client, AC-7)', () => {
    it('names the sample client James', () => {
        expect(SAMPLE_FIRST_NAME).toBe('James')
    })

    it('returns no due items when the template has no timing', () => {
        expect(sampleDueItems(null, TODAY)).toEqual([])
    })

    it('gives Past Due one group two days overdue, dated two days before today', () => {
        expect(sampleDueItems('PAST_DUE', TODAY)).toEqual([{
            contractId: 'sample',
            installmentNo: 3,
            amount: 340000,
            plotNumbers: ['4', '5'],
            projectName: 'Kigamboni Greens',
            dueDate: '2026-10-25',
            daysOverdue: 2,
        }])
    })

    it('gives Due Today one group dated today with no day count', () => {
        const [item] = sampleDueItems('DUE_TODAY', TODAY)

        expect(item.dueDate).toBe(TODAY)
        expect(item.daysOverdue).toBeUndefined()
        expect(item.daysRemaining).toBeUndefined()
    })

    it('gives Upcoming one group three days out, crossing a month end correctly', () => {
        const [item] = sampleDueItems('UPCOMING', '2026-10-30')

        expect(item.dueDate).toBe('2026-11-02')
        expect(item.daysRemaining).toBe(3)
    })

    it('hands out a fresh plot list each call, so a caller cannot change the sample', () => {
        sampleDueItems('PAST_DUE', TODAY)[0].plotNumbers.push('99')

        expect(sampleDueItems('PAST_DUE', TODAY)[0].plotNumbers).toEqual(['4', '5'])
    })

    it('renders the AC-2 sample string through the real render path', () => {
        const result = renderMessageTemplate(
            {body: PAST_DUE_BODY, reminderTiming: 'PAST_DUE'},
            {firstName: SAMPLE_FIRST_NAME, dueItems: sampleDueItems('PAST_DUE', TODAY)},
        )

        expect(result.text).toBe(AC2_SAMPLE)
        expect(result.charCount).toBe(243)
    })
})

describe('todayDateString', () => {
    it('uses the UTC date, so 01:00 East Africa Time is still yesterday (known offset)', () => {
        expect(todayDateString(new Date('2026-10-26T22:00:00Z'))).toBe('2026-10-26')
    })
})

// ---------- findDueItemsForContact ----------

type Row = Record<string, unknown>
const dialect = new PgDialect()

function installment(overrides: Row = {}): Row {
    return {
        contractId: 'c1',
        installmentNo: 9,
        dueDate: '2026-10-17',
        amountDue: '500000',
        amountPaid: '250000',
        waivedAmount: '0',
        status: 'PARTIAL',
        plot: {plotNumber: 4},
        ...overrides,
    }
}

function makeDb(contracts: Row[], installments: Row[]) {
    const contractQuery = vi.fn<(args: {where: SQL}) => Promise<Row[]>>(async () => contracts)
    const installmentQuery = vi.fn<(args: {where: SQL}) => Promise<Row[]>>(async () => installments)
    const db = {
        query: {
            plotSaleContracts: {findMany: contractQuery},
            contractInstallments: {findMany: installmentQuery},
        },
    }
    return {db: db as unknown as Parameters<typeof findDueItemsForContact>[0], contractQuery, installmentQuery}
}

const contract = (id: string, projectName: string) => ({id, project: {projectName}})

describe('findDueItemsForContact', () => {
    it('scopes contracts to this client and to ACTIVE or DELINQUENT status', async () => {
        const {db, contractQuery} = makeDb([], [])

        await findDueItemsForContact(db, 'contact-1', 'PAST_DUE', TODAY)

        const {sql, params} = dialect.sqlToQuery(contractQuery.mock.calls[0][0].where)
        expect(sql).toContain('"client_contact_id" = $1')
        expect(params).toEqual(['contact-1', 'ACTIVE', 'DELINQUENT'])
    })

    it('never looks up installments when the client has no ongoing contract', async () => {
        const {db, installmentQuery} = makeDb([], [])

        expect(await findDueItemsForContact(db, 'contact-1', 'PAST_DUE', TODAY)).toEqual([])
        expect(installmentQuery).not.toHaveBeenCalled()
    })

    it('leaves PAID installments out at the query, but keeps PARTIAL ones', async () => {
        const {db, installmentQuery} = makeDb([contract('c1', 'Mbweni Heights')], [installment()])

        const items = await findDueItemsForContact(db, 'contact-1', 'PAST_DUE', TODAY)

        const {sql, params} = dialect.sqlToQuery(installmentQuery.mock.calls[0][0].where)
        expect(sql).toMatch(/"status" <> \$\d/)
        expect(params).toContain('PAID')
        expect(items).toHaveLength(1)
    })

    it('reports the outstanding amount and days overdue for a partly paid installment', async () => {
        const {db} = makeDb([contract('c1', 'Mbweni Heights')], [installment()])

        const [item] = await findDueItemsForContact(db, 'contact-1', 'PAST_DUE', TODAY)

        expect(item).toMatchObject({amount: 250000, daysOverdue: 10, plotNumbers: ['4'], projectName: 'Mbweni Heights'})
    })

    it('floors the amount at zero when a waiver is larger than what is owed', async () => {
        const {db} = makeDb([contract('c1', 'P')], [installment({waivedAmount: '400000'})])

        const [item] = await findDueItemsForContact(db, 'contact-1', 'PAST_DUE', TODAY)

        expect(item.amount).toBe(0)
    })

    it('treats a missing waiver as zero', async () => {
        const {db} = makeDb([contract('c1', 'P')], [installment({waivedAmount: null})])

        const [item] = await findDueItemsForContact(db, 'contact-1', 'PAST_DUE', TODAY)

        expect(item.amount).toBe(250000)
    })

    it('folds both plots of one installment into one line, in number order not text order', async () => {
        const {db} = makeDb([contract('c1', 'P')], [
            installment({plot: {plotNumber: 10}, amountPaid: '0'}),
            installment({plot: {plotNumber: 9}, amountPaid: '0'}),
        ])

        const items = await findDueItemsForContact(db, 'contact-1', 'PAST_DUE', TODAY)

        expect(items).toHaveLength(1)
        expect(items[0].plotNumbers).toEqual(['9', '10'])
        expect(items[0].amount).toBe(1000000)
    })

    it('splits two installment numbers on the same contract into two lines', async () => {
        const {db} = makeDb([contract('c1', 'P')], [
            installment({installmentNo: 8, dueDate: '2026-09-17'}),
            installment({installmentNo: 9}),
        ])

        const items = await findDueItemsForContact(db, 'contact-1', 'PAST_DUE', TODAY)

        expect(items.map((i) => i.installmentNo)).toEqual([8, 9])
    })

    it('names each line after its own contract\'s project (AC-6)', async () => {
        const {db} = makeDb([contract('c1', 'Kigamboni Greens'), contract('c2', 'Mbweni Heights')], [
            installment({contractId: 'c1', plot: {plotNumber: 4}}),
            installment({contractId: 'c1', plot: {plotNumber: 5}}),
            installment({contractId: 'c2', installmentNo: 2, plot: {plotNumber: 2}}),
        ])

        const items = await findDueItemsForContact(db, 'contact-1', 'PAST_DUE', TODAY)

        expect(items).toEqual([
            expect.objectContaining({contractId: 'c1', plotNumbers: ['4', '5'], projectName: 'Kigamboni Greens'}),
            expect.objectContaining({contractId: 'c2', plotNumbers: ['2'], projectName: 'Mbweni Heights'}),
        ])
    })

    describe('timing windows', () => {
        const rows = [
            installment({installmentNo: 1, dueDate: '2026-10-26'}), // yesterday
            installment({installmentNo: 2, dueDate: TODAY}),
            installment({installmentNo: 3, dueDate: '2026-10-30'}), // today + 3
            installment({installmentNo: 4, dueDate: '2026-10-31'}), // today + 4
        ]

        it.each([
            ['PAST_DUE', [1]],
            ['DUE_TODAY', [2]],
            ['UPCOMING', [3]],
        ] as const)('%s finds only installment %j', async (timing, expected) => {
            const {db} = makeDb([contract('c1', 'P')], rows)

            const items = await findDueItemsForContact(db, 'contact-1', timing, TODAY)

            expect(items.map((i) => i.installmentNo)).toEqual(expected)
        })

        it('sets days remaining only for Upcoming and days overdue only for Past Due', async () => {
            const {db} = makeDb([contract('c1', 'P')], rows)

            const [upcoming] = await findDueItemsForContact(db, 'contact-1', 'UPCOMING', TODAY)
            const [dueToday] = await findDueItemsForContact(db, 'contact-1', 'DUE_TODAY', TODAY)

            expect(upcoming).toMatchObject({daysRemaining: 3})
            expect(upcoming.daysOverdue).toBeUndefined()
            expect(dueToday.daysOverdue).toBeUndefined()
            expect(dueToday.daysRemaining).toBeUndefined()
        })
    })
})
