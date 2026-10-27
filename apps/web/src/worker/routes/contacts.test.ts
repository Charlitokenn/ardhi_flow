import {describe, expect, it, vi} from 'vitest'
import {Hono} from 'hono'
import type {Env, Variables} from '../types'
import contactsRoute from './contacts'

// The route is exercised for real; only the tenant database is stubbed (the
// system boundary). Auth and tenant resolution run before this sub app in
// production and are not part of what this file changed.

type Row = Record<string, unknown>

function makeTenantDb({
    existingMobiles = [] as (string | null)[],
    contact = undefined as Row | undefined,
} = {}) {
    const inserted: Row[] = []
    const db = {
        query: {
            contacts: {
                findMany: vi.fn(async () => existingMobiles.map((mobileNumber) => ({mobileNumber}))),
                findFirst: vi.fn(async () => contact),
            },
        },
        insert: vi.fn(() => ({
            values: (values: Row) => ({
                returning: async () => {
                    inserted.push(values)
                    return [{id: `new-${inserted.length}`, ...values}]
                },
            }),
        })),
    }
    return {db, inserted}
}

function appWith(db: unknown) {
    return new Hono<{ Bindings: Env; Variables: Variables }>()
        .use(async (c, next) => {
            c.set('tenantDb', db as Variables['tenantDb'])
            await next()
        })
        .route('/api/contacts', contactsRoute)
}

async function postBulk(db: unknown, rows: unknown) {
    const res = await appWith(db).request('/api/contacts/bulk', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({rows}),
    })
    return {status: res.status, body: await res.json() as {created: number, results: Row[]}}
}

const valid = (overrides: Row = {}) => ({
    fullName: 'Asha Mdoe',
    mobileNumber: '+255700000001',
    contactType: 'CLIENT',
    ...overrides,
})

describe('POST /api/contacts/bulk', () => {
    it('creates every valid row and reports each one with its new id (0005 AC-1)', async () => {
        const {db, inserted} = makeTenantDb()

        const {status, body} = await postBulk(db, [
            valid(),
            valid({fullName: 'Agent Mike', mobileNumber: '+255700000002', contactType: 'SALES_AGENT'}),
        ])

        expect(status).toBe(200)
        expect(body.created).toBe(2)
        expect(body.results).toEqual([
            {row: 1, status: 'created', id: 'new-1'},
            {row: 2, status: 'created', id: 'new-2'},
        ])
        expect(inserted.map((r) => r.fullName)).toEqual(['Asha Mdoe', 'Agent Mike'])
    })

    it.each([
        ['missing', {fullName: undefined}],
        ['null', {fullName: null}],
        ['empty', {fullName: ''}],
        ['only spaces', {fullName: '   '}],
    ])('fails a row whose fullName is %s, with a fullName reason (0005 AC-4)', async (_label, override) => {
        const {db, inserted} = makeTenantDb()

        const {body} = await postBulk(db, [valid(override)])

        expect(body.created).toBe(0)
        expect(body.results[0]).toMatchObject({row: 1, status: 'failed'})
        expect(body.results[0].reason).toMatch(/^fullName: /)
        expect(inserted).toHaveLength(0)
    })

    it.each([
        ['missing', {mobileNumber: undefined}],
        ['null', {mobileNumber: null}],
        ['empty', {mobileNumber: ''}],
    ])('fails a row whose mobileNumber is %s, with a mobileNumber reason (0005 AC-4)', async (_label, override) => {
        const {db} = makeTenantDb()

        const {body} = await postBulk(db, [valid(override)])

        expect(body.results[0]).toMatchObject({row: 1, status: 'failed'})
        expect(body.results[0].reason).toMatch(/^mobileNumber: /)
    })

    it.each([
        ['missing', {contactType: undefined}],
        ['null', {contactType: null}],
        ['not a known type', {contactType: 'ASTRONAUT'}],
    ])('fails a row whose contactType is %s, with a contactType reason (0005 AC-4)', async (_label, override) => {
        const {db} = makeTenantDb()

        const {body} = await postBulk(db, [valid(override)])

        expect(body.results[0]).toMatchObject({row: 1, status: 'failed'})
        expect(body.results[0].reason).toMatch(/^contactType: /)
    })

    it('names every bad field of one row in a single reason (0005 AC-4)', async () => {
        const {db} = makeTenantDb()

        const {body} = await postBulk(db, [{fullName: '', mobileNumber: null}])

        expect(body.results[0].reason).toContain('fullName: ')
        expect(body.results[0].reason).toContain('mobileNumber: ')
        expect(body.results[0].reason).toContain('contactType: ')
    })

    it('still creates the valid rows around a failed one (0005 AC-4)', async () => {
        const {db} = makeTenantDb()

        const {body} = await postBulk(db, [
            valid({mobileNumber: '+255700000001'}),
            valid({mobileNumber: ''}),
            valid({mobileNumber: '+255700000003'}),
        ])

        expect(body.created).toBe(2)
        expect(body.results.map((r) => r.status)).toEqual(['created', 'failed', 'created'])
    })

    it('skips a row whose mobile matches an existing contact in a different format (0005 AC-2)', async () => {
        const {db, inserted} = makeTenantDb({existingMobiles: ['+255697565642', null]})

        const {body} = await postBulk(db, [valid({mobileNumber: '255-697 565 642'})])

        expect(body.created).toBe(0)
        expect(body.results[0]).toEqual({row: 1, status: 'skipped', reason: 'Mobile number already exists'})
        expect(inserted).toHaveLength(0)
    })

    it('creates the first of two rows sharing a mobile and skips the second (0005 AC-3)', async () => {
        const {db} = makeTenantDb()

        const {body} = await postBulk(db, [
            valid({fullName: 'First', mobileNumber: '+255 700 800 001'}),
            valid({fullName: 'Second', mobileNumber: '+255700800001'}),
        ])

        expect(body.created).toBe(1)
        expect(body.results[1]).toEqual({row: 2, status: 'skipped', reason: 'Duplicate mobile number in file'})
    })

    it('does not count a failed row toward duplicates, so a later valid row with that mobile is created', async () => {
        const {db} = makeTenantDb()

        const {body} = await postBulk(db, [
            valid({fullName: '', mobileNumber: '+255700800009'}),
            valid({mobileNumber: '+255700800009'}),
        ])

        expect(body.results.map((r) => r.status)).toEqual(['failed', 'created'])
    })

    it('never lets a row set isDeleted or an id; both stay server controlled', async () => {
        const {db, inserted} = makeTenantDb()

        await postBulk(db, [valid({isDeleted: true, id: 'client-chosen-id'})])

        expect(inserted[0]).not.toHaveProperty('isDeleted')
        expect(inserted[0]).not.toHaveProperty('id')
    })

    it.each([
        ['an empty rows array', []],
        ['rows that is not an array', 'nope'],
    ])('rejects %s with 400 and writes nothing', async (_label, rows) => {
        const {db, inserted} = makeTenantDb()

        const {status} = await postBulk(db, rows)

        expect(status).toBe(400)
        expect(inserted).toHaveLength(0)
    })
})

// --- statement-data ---------------------------------------------------------

const contract = (id: string, startDate: string, overrides: Row = {}) => ({
    id,
    startDate,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    status: 'ACTIVE',
    payments: [],
    salesAgent: {id: 'agent-1', fullName: 'Agent Sarah', isDeleted: false},
    ...overrides,
})

const entry = (c: ReturnType<typeof contract>, overrides: Row = {}) => ({
    contract: c,
    allocatedValue: 1_000_000,
    installments: [{installmentNo: 1, plotId: 'plot'}],
    ...overrides,
})

const contactWith = (plots: Row[], extra: Row = {}) => ({
    id: 'contact-1',
    fullName: 'Peter Lema',
    plots,
    plotSaleContractsAsAgent: [],
    projectAcquisitionsAsSeller: [],
    vendorJobs: [],
    ...extra,
})

async function getStatement(contact: Row | undefined) {
    const {db} = makeTenantDb({contact})
    const res = await appWith(db).request('/api/contacts/contact-1/statement-data')
    return {status: res.status, body: await res.json() as Row & {plots: Row[]; plotSaleContractsAsAgent: Row[]}}
}

describe('GET /api/contacts/:id/statement-data', () => {
    it('returns 404 when the contact is missing or soft deleted (0002 AC-5)', async () => {
        const {status, body} = await getStatement(undefined)

        expect(status).toBe(404)
        expect(body).toEqual({error: 'Not found'})
    })

    it('returns plots: [] for a contact with no plots (0002 AC-2)', async () => {
        const {status, body} = await getStatement(contactWith([]))

        expect(status).toBe(200)
        expect(body.plots).toEqual([])
    })

    it('picks the active contract even when a newer cancelled one exists (0002 AC-2)', async () => {
        const active = contract('active', '2026-02-03')
        const newerCancelled = contract('cancelled', '2027-02-03', {status: 'CANCELLED'})

        const {body} = await getStatement(contactWith([
            {id: 'plot-1', activeContractId: 'active', project: {}, contractPlots: [entry(newerCancelled), entry(active)]},
        ]))

        expect((body.plots[0].latestContract as Row).id).toBe('active')
    })

    it('falls back to the newest contract by startDate, any status, when no contract is active (0002 AC-2)', async () => {
        const older = contract('older', '2026-01-01', {status: 'COMPLETED'})
        const newer = contract('newer', '2027-01-01', {status: 'CANCELLED'})

        const {body} = await getStatement(contactWith([
            {id: 'plot-1', activeContractId: null, project: {}, contractPlots: [entry(older), entry(newer)]},
        ]))

        expect((body.plots[0].latestContract as Row).id).toBe('newer')
    })

    it('breaks a startDate tie by createdAt, then by id', async () => {
        const sameDay = '2026-05-01'
        const earlier = contract('b-earlier', sameDay, {createdAt: new Date('2026-05-01T08:00:00Z')})
        const later = contract('a-later', sameDay, {createdAt: new Date('2026-05-01T09:00:00Z')})
        const tieA = contract('id-a', sameDay)
        const tieZ = contract('id-z', sameDay)

        const {body} = await getStatement(contactWith([
            {id: 'p1', activeContractId: null, project: {}, contractPlots: [entry(earlier), entry(later)]},
            {id: 'p2', activeContractId: null, project: {}, contractPlots: [entry(tieA), entry(tieZ)]},
        ]))

        expect((body.plots[0].latestContract as Row).id).toBe('a-later')
        expect((body.plots[1].latestContract as Row).id).toBe('id-z')
    })

    it('gives latestContract the plot\'s own allocatedValue and installments, plus payments and salesAgent (0002 AC-2)', async () => {
        const c = contract('c1', '2026-01-01', {installments: [{installmentNo: 99, plotId: 'other-plot'}]})

        const {body} = await getStatement(contactWith([
            {
                id: 'plot-1',
                activeContractId: 'c1',
                project: {projectName: 'Mbweni Heights'},
                contractPlots: [entry(c, {allocatedValue: 6_000_000, installments: [{installmentNo: 1, plotId: 'plot-1'}]})],
            },
        ]))

        const plot = body.plots[0]
        const latest = plot.latestContract as Row
        expect(plot.project).toEqual({projectName: 'Mbweni Heights'})
        expect(plot).not.toHaveProperty('contractPlots')
        expect(latest.allocatedValue).toBe(6_000_000)
        expect(latest.installments).toEqual([{installmentNo: 1, plotId: 'plot-1'}])
        expect(latest).toHaveProperty('payments')
        expect(latest).toHaveProperty('salesAgent')
    })

    it('returns latestContract: null for a plot with no contracts yet', async () => {
        const {body} = await getStatement(contactWith([
            {id: 'plot-1', activeContractId: null, project: {}, contractPlots: []},
        ]))

        expect(body.plots[0].latestContract).toBeNull()
    })

    it('keeps a soft deleted sales agent on the contract, flagged isDeleted (0002 AC-5)', async () => {
        const c = contract('c1', '2026-01-01', {salesAgent: {id: 'agent-9', fullName: 'Agent Gone', isDeleted: true}})

        const {body} = await getStatement(contactWith([
            {id: 'plot-1', activeContractId: 'c1', project: {}, contractPlots: [entry(c)]},
        ]))

        expect((body.plots[0].latestContract as Row).salesAgent).toEqual({id: 'agent-9', fullName: 'Agent Gone', isDeleted: true})
    })

    it('lists only uncancelled plots on contracts the contact earns commission on', async () => {
        const {body} = await getStatement(contactWith([], {
            plotSaleContractsAsAgent: [{
                id: 'k1',
                contractPlots: [
                    {cancelledAt: null, plot: {id: 'kept'}},
                    {cancelledAt: '2026-03-01', plot: {id: 'dropped'}},
                ],
            }],
        }))

        const agentContract = body.plotSaleContractsAsAgent[0]
        expect(agentContract.plots).toEqual([{id: 'kept'}])
        expect(agentContract).not.toHaveProperty('contractPlots')
    })
})
