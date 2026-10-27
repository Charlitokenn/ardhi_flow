import {describe, expect, it, vi} from 'vitest'
import {Hono} from 'hono'
import {PgDialect} from 'drizzle-orm/pg-core'
import type {SQL} from 'drizzle-orm'
import type {Env, Variables} from '../types'
import messageTemplatesRoute from './message-templates'

// The route is exercised for real; only the tenant database is stubbed (the
// system boundary). Auth and tenant resolution run before this sub app in
// production, so the stub middleware sets the role they would have attached.

type Row = Record<string, unknown>

const dialect = new PgDialect()

// Applies the soft delete filter the real query would, so a lookup that
// forgets `isDeleted = false` still "finds" a deleted row, just like Postgres.
function honorsIsDeletedFilter(where: SQL | undefined, row: Row | undefined) {
    if (!row || !where) return row
    const filtersDeleted = dialect.sqlToQuery(where).sql.includes('"is_deleted"')
    return filtersDeleted && row.isDeleted ? undefined : row
}

function makeTenantDb(template: Row) {
    const updates: Row[] = []
    const db = {
        query: {
            messageTemplates: {
                findFirst: vi.fn(async ({where}: { where?: SQL }) => honorsIsDeletedFilter(where, template)),
            },
        },
        update: vi.fn(() => ({
            set: (values: Row) => ({
                where: () => ({
                    returning: async () => {
                        updates.push(values)
                        return [{...template, ...values}]
                    },
                }),
            }),
        })),
    }
    return {db, updates}
}

function appWith(db: unknown, orgRole = 'org:admin') {
    return new Hono<{ Bindings: Env; Variables: Variables }>()
        .use(async (c, next) => {
            c.set('tenantDb', db as Variables['tenantDb'])
            c.set('orgRole', orgRole)
            c.set('userId', 'user_admin')
            await next()
        })
        .route('/api/message-templates', messageTemplatesRoute)
}

const ID = '11111111-1111-4111-8111-111111111111'

const defaultTemplate = (overrides: Row = {}) => ({
    id: ID,
    name: 'Upcoming Installment Reminder',
    category: 'PAYMENT_REMINDER',
    reminderTiming: 'UPCOMING',
    channel: 'SMS',
    body: 'Habari {firstName}, {dueItems} Tafadhali fanya malipo kwa wakati.',
    isDefault: true,
    isActive: true,
    isDeleted: false,
    ...overrides,
})

async function patch(db: unknown, json: Row) {
    const res = await appWith(db).request(`/api/message-templates/${ID}`, {
        method: 'PATCH',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify(json),
    })
    return {status: res.status, body: await res.json() as Row}
}

describe('PATCH /api/message-templates/:id on a default template', () => {
    it('lets an admin switch isActive, the one field a default may change (spec 0002 data model)', async () => {
        const {db, updates} = makeTenantDb(defaultTemplate())

        const {status, body} = await patch(db, {isActive: false})

        expect(status).toBe(200)
        expect(body.isActive).toBe(false)
        expect(updates).toHaveLength(1)
        expect(updates[0]).toMatchObject({isActive: false})
    })

    it.each([
        ['the name', {name: 'Renamed'}],
        ['the body', {body: 'Habari {firstName}'}],
        ['isActive together with content', {isActive: false, name: 'Renamed'}],
        ['an empty patch', {}],
    ])('rejects a change to %s with 422 and writes nothing (AC-3)', async (_label, json) => {
        const {db, updates} = makeTenantDb(defaultTemplate())

        const {status} = await patch(db, json)

        expect(status).toBe(422)
        expect(updates).toHaveLength(0)
    })
})

describe('DELETE /api/message-templates/:id', () => {
    it('returns 404 for a template that is already soft deleted (AC-10)', async () => {
        const {db, updates} = makeTenantDb(defaultTemplate({isDefault: false, isDeleted: true}))

        const res = await appWith(db).request(`/api/message-templates/${ID}`, {method: 'DELETE'})

        expect(res.status).toBe(404)
        expect(updates).toHaveLength(0)
    })

    it('soft deletes a live non default template', async () => {
        const {db, updates} = makeTenantDb(defaultTemplate({isDefault: false}))

        const res = await appWith(db).request(`/api/message-templates/${ID}`, {method: 'DELETE'})

        expect(res.status).toBe(200)
        expect(updates[0]).toMatchObject({isDeleted: true})
    })
})

// ---------- Preview, permissions, create, duplicate ----------

function makePreviewDb(contact: Row | undefined) {
    return {
        query: {
            contacts: {findFirst: vi.fn(async () => contact)},
            plotSaleContracts: {findMany: vi.fn(async () => [])},
            contractInstallments: {findMany: vi.fn(async () => [])},
        },
    }
}

function makeWriteDb(existing?: Row) {
    const inserts: Row[] = []
    const db = {
        query: {messageTemplates: {findFirst: vi.fn(async () => existing)}},
        insert: vi.fn(() => ({
            values: (values: Row) => ({
                returning: async () => {
                    inserts.push(values)
                    return [{id: '22222222-2222-4222-8222-222222222222', ...values}]
                },
            }),
        })),
        update: vi.fn(),
    }
    return {db, inserts}
}

async function send(db: unknown, method: string, path: string, json?: Row, orgRole = 'org:admin') {
    const res = await appWith(db, orgRole).request(`/api/message-templates${path}`, {
        method,
        headers: {'content-type': 'application/json'},
        body: json === undefined ? undefined : JSON.stringify(json),
    })
    return {status: res.status, body: await res.json() as Row}
}

const PAST_DUE_BODY = 'Habari {firstName}, {dueItems} Tafadhari fanya malipo kuepuka tozo za adhabu au kuvunjwa kwa mkataba.'
const CONTACT_ID = '33333333-3333-4333-8333-333333333333'

describe('POST /api/message-templates/preview', () => {
    it('renders the fixed sample client when no contactId is sent, without reading any tenant table (AC-7)', async () => {
        const db = makePreviewDb(undefined)

        const {status, body} = await send(db, 'POST', '/preview', {body: PAST_DUE_BODY, reminderTiming: 'PAST_DUE'}, 'org:member')

        expect(status).toBe(200)
        expect(body).toEqual({
            text: 'Habari James, Unakumbumbushwa kulipia rejesho namba 3 la Tshs. 340,000 kwa ajili ya plot namba: 4,5 mradi wa Kigamboni Greens. Umechelewesha kulipa rejesho hili kwa siku 2. Tafadhari fanya malipo kuepuka tozo za adhabu au kuvunjwa kwa mkataba.',
            charCount: 243,
            segmentCount: 2,
            dueItemsFound: 1,
        })
        expect(db.query.contacts.findFirst).not.toHaveBeenCalled()
        expect(db.query.plotSaleContracts.findMany).not.toHaveBeenCalled()
        expect(db.query.contractInstallments.findMany).not.toHaveBeenCalled()
    })

    it('gives the sample no due items and Tshs. 0 when the template has no timing (AC-7, AC-8)', async () => {
        const {status, body} = await send(makePreviewDb(undefined), 'POST', '/preview', {body: 'Asante {firstName} {totalAmount}', reminderTiming: null})

        expect(status).toBe(200)
        expect(body).toMatchObject({text: 'Asante James Tshs. 0', dueItemsFound: 0})
    })

    it.each([
        ['the sample', {}],
        ['a real contact', {contactId: CONTACT_ID}],
    ])('rejects {dueItems} with no timing with 422 for %s (Key invariants)', async (_label, extra) => {
        const db = makePreviewDb({fullName: 'Said Massawe'})

        const {status} = await send(db, 'POST', '/preview', {...extra, body: '{dueItems}', reminderTiming: null})

        expect(status).toBe(422)
        expect(db.query.contacts.findFirst).not.toHaveBeenCalled()
    })

    it('returns 404 for an unknown contact (AC-5)', async () => {
        const {status} = await send(makePreviewDb(undefined), 'POST', '/preview', {contactId: CONTACT_ID, body: 'Hi {firstName}', reminderTiming: null})

        expect(status).toBe(404)
    })

    it('rejects a contactId that is not a uuid with 400', async () => {
        const {status} = await send(makePreviewDb(undefined), 'POST', '/preview', {contactId: 'not-a-uuid', body: 'x', reminderTiming: null})

        expect(status).toBe(400)
    })

    it('uses only the first word of a real contact name, ignoring extra spaces', async () => {
        const db = makePreviewDb({fullName: '  Said   Ali Massawe '})

        const {status, body} = await send(db, 'POST', '/preview', {contactId: CONTACT_ID, body: '[{firstName}]', reminderTiming: null}, 'org:member')

        expect(status).toBe(200)
        expect(body.text).toBe('[Said]')
    })

    it('shows the nothing due line for a real client with nothing in that timing (AC-11)', async () => {
        const db = makePreviewDb({fullName: 'Said Massawe'})

        const {body} = await send(db, 'POST', '/preview', {contactId: CONTACT_ID, body: 'Habari {firstName}, {dueItems}', reminderTiming: 'UPCOMING'})

        expect(body).toMatchObject({text: 'Habari Said, Nothing due for this reminder timing.', dueItemsFound: 0})
        expect(db.query.plotSaleContracts.findMany).toHaveBeenCalledTimes(1)
    })
})

describe('admin only actions (AC-4)', () => {
    const draft = {name: 'Asante', category: 'GENERAL', reminderTiming: null, channel: 'SMS', body: 'Asante {firstName}'}

    it.each([
        ['create', 'POST', '', draft],
        ['edit', 'PATCH', `/${ID}`, {name: 'x'}],
        ['delete', 'DELETE', `/${ID}`, undefined],
        ['duplicate', 'POST', `/${ID}/duplicate`, {}],
    ])('refuses a member who tries to %s with 403 and touches nothing', async (_label, method, path, json) => {
        const {db, inserts} = makeWriteDb(defaultTemplate({isDefault: false}))

        const {status, body} = await send(db, method, path, json, 'org:member')

        expect(status).toBe(403)
        expect(body.error).toBe('Only an org admin can manage message templates')
        expect(inserts).toHaveLength(0)
        expect(db.update).not.toHaveBeenCalled()
    })

    it('lets any staff member list templates, filtered to live rows (AC-4, AC-10)', async () => {
        const findMany = vi.fn<(args: {where: SQL}) => Promise<Row[]>>(async () => [defaultTemplate()])
        const db = {query: {messageTemplates: {findMany}}}

        const res = await appWith(db, 'org:member').request('/api/message-templates')

        expect(res.status).toBe(200)
        expect(dialect.sqlToQuery(findMany.mock.calls[0][0].where).sql).toContain('"is_deleted"')
    })
})

describe('POST /api/message-templates', () => {
    it('creates a template stamped with the admin as createdBy, ignoring a client supplied default flag (AC-1)', async () => {
        const {db, inserts} = makeWriteDb()

        const {status, body} = await send(db, 'POST', '', {
            name: 'Asante',
            category: 'GENERAL',
            reminderTiming: null,
            channel: 'WHATSAPP',
            body: 'Asante {firstName}',
            isDefault: true,
        })

        expect(status).toBe(201)
        expect(body).toMatchObject({name: 'Asante', channel: 'WHATSAPP', createdBy: 'user_admin'})
        expect(inserts[0]).not.toHaveProperty('isDefault')
    })

    it('rejects {dueItems} with no timing with 422 and saves nothing (AC-1, Key invariants)', async () => {
        const {db, inserts} = makeWriteDb()

        const {status} = await send(db, 'POST', '', {name: 'x', category: 'PAYMENT_REMINDER', reminderTiming: null, channel: 'SMS', body: '{dueItems}'})

        expect(status).toBe(422)
        expect(inserts).toHaveLength(0)
    })
})

describe('POST /api/message-templates/:id/duplicate', () => {
    it('copies a default into a normal, editable, active row named "<name> copy" (AC-3)', async () => {
        const {db, inserts} = makeWriteDb(defaultTemplate({isActive: false}))

        const {status, body} = await send(db, 'POST', `/${ID}/duplicate`, {})

        expect(status).toBe(201)
        expect(body).toMatchObject({name: 'Upcoming Installment Reminder copy', isDefault: false, isActive: true, createdBy: 'user_admin'})
        expect(inserts[0]).toMatchObject({body: defaultTemplate().body, reminderTiming: 'UPCOMING', channel: 'SMS'})
    })

    it('uses the name the admin gives', async () => {
        const {db} = makeWriteDb(defaultTemplate())

        const {body} = await send(db, 'POST', `/${ID}/duplicate`, {name: 'Kumbusho'})

        expect(body.name).toBe('Kumbusho')
    })

    it('returns 404 for a missing or soft deleted template (AC-10)', async () => {
        const {db, inserts} = makeWriteDb(undefined)

        const {status} = await send(db, 'POST', `/${ID}/duplicate`, {})

        expect(status).toBe(404)
        expect(inserts).toHaveLength(0)
    })
})
