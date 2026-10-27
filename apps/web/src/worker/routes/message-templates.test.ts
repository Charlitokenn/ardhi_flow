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
