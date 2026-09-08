import {Hono} from 'hono'
import {zValidator} from '@hono/zod-validator'
import {createInsertSchema} from 'drizzle-zod'
import {and, desc, eq} from 'drizzle-orm'
import {z} from 'zod'
import type {Env, Variables} from '../types'
import {contacts, messageTemplates} from '../../../drizzle/tenant/schema'
import {findDueItemsForContact, renderMessageTemplate} from '../lib/message-templates'

// isDefault/isDeleted/createdBy/timestamps are all server controlled — never
// accepted from the client, same convention as contacts.ts.
const insertMessageTemplateSchema = createInsertSchema(messageTemplates).omit({
    id: true,
    isDefault: true,
    isDeleted: true,
    createdBy: true,
    createdAt: true,
    updatedAt: true,
})

const previewBodySchema = z.object({
    contactId: z.string().uuid(),
    // The template's current body/reminderTiming, sent directly rather than
    // looked up by a saved id — this is what lets the editor preview a
    // draft as the admin types, before it has ever been saved (AC-7), using
    // the exact same code path the datagrid's "Preview" row action uses for
    // an already-saved template.
    body: z.string(),
    reminderTiming: z.enum(['UPCOMING', 'DUE_TODAY', 'PAST_DUE']).nullable(),
})

// A template whose body uses {dueItems} must have reminderTiming set — it is
// the only signal the preview/render step has for which date window to
// query. See spec Key invariants.
function reminderTimingInvariantError(body: string, reminderTiming: string | null | undefined): string | null {
    if (body.includes('{dueItems}') && !reminderTiming) {
        return 'A template whose body contains {dueItems} must set reminderTiming'
    }
    return null
}

function requireAdmin(c: {get: (key: 'orgRole') => string}): {error: string} | null {
    if (c.get('orgRole') !== 'org:admin') {
        return {error: 'Only an org admin can manage message templates'}
    }
    return null
}

const messageTemplatesRoute = new Hono<{ Bindings: Env; Variables: Variables }>()
    .get('/', async (c) => {
        const rows = await c.get('tenantDb')
            .query.messageTemplates.findMany({
                where: eq(messageTemplates.isDeleted, false),
                orderBy: [desc(messageTemplates.createdAt)],
            })
        return c.json(rows)
    })
    .post('/', zValidator('json', insertMessageTemplateSchema), async (c) => {
        const forbidden = requireAdmin(c)
        if (forbidden) return c.json(forbidden, 403)

        const input = c.req.valid('json')
        const invariantError = reminderTimingInvariantError(input.body, input.reminderTiming)
        if (invariantError) return c.json({error: invariantError}, 422)

        const [created] = await c.get('tenantDb')
            .insert(messageTemplates)
            .values({...input, createdBy: c.get('userId')})
            .returning()
        return c.json(created, 201)
    })
    // Registered ahead of `/:id` so "preview" is never read as an id, same
    // convention as installments.ts's `/bulk`. Renders one template body
    // against one real client's real due installments — the tracer bullet
    // through DB -> grouping -> render described in the spec, and the tool
    // a staff member uses to sanity check a template before relying on it.
    // Takes body/reminderTiming directly (not a saved template id) so the
    // editor can preview a draft as the admin types, before it has ever
    // been saved.
    .post('/preview', zValidator('json', previewBodySchema), async (c) => {
        const {contactId, body, reminderTiming} = c.req.valid('json')
        const db = c.get('tenantDb')

        const contact = await db.query.contacts.findFirst({
            where: eq(contacts.id, contactId),
            columns: {fullName: true},
        })
        if (!contact) return c.json({error: 'Contact not found'}, 404)

        const dueItems = reminderTiming
            ? await findDueItemsForContact(db, contactId, reminderTiming)
            : []

        const firstName = contact.fullName.trim().split(/\s+/)[0] ?? contact.fullName
        const result = renderMessageTemplate({body, reminderTiming}, {firstName, dueItems})
        return c.json(result)
    })
    .patch('/:id', zValidator('json', insertMessageTemplateSchema.partial()), async (c) => {
        const forbidden = requireAdmin(c)
        if (forbidden) return c.json(forbidden, 403)

        const id = c.req.param('id')
        const input = c.req.valid('json')
        const db = c.get('tenantDb')

        const existing = await db.query.messageTemplates.findFirst({
            where: and(eq(messageTemplates.id, id), eq(messageTemplates.isDeleted, false)),
        })
        if (!existing) return c.json({error: 'Not found'}, 404)
        if (existing.isDefault) {
            return c.json({error: 'A default template cannot be edited — duplicate it instead'}, 422)
        }

        const finalBody = input.body ?? existing.body
        const finalTiming = input.reminderTiming !== undefined ? input.reminderTiming : existing.reminderTiming
        const invariantError = reminderTimingInvariantError(finalBody, finalTiming)
        if (invariantError) return c.json({error: invariantError}, 422)

        const [updated] = await db
            .update(messageTemplates)
            .set({...input, updatedAt: new Date()})
            .where(eq(messageTemplates.id, id))
            .returning()
        return c.json(updated)
    })
    .delete('/:id', async (c) => {
        const forbidden = requireAdmin(c)
        if (forbidden) return c.json(forbidden, 403)

        const id = c.req.param('id')
        const db = c.get('tenantDb')

        const existing = await db.query.messageTemplates.findFirst({
            where: eq(messageTemplates.id, id),
        })
        if (!existing) return c.json({error: 'Not found'}, 404)
        if (existing.isDefault) {
            return c.json({error: 'A default template cannot be deleted'}, 422)
        }

        const [deleted] = await db
            .update(messageTemplates)
            .set({isDeleted: true, updatedAt: new Date()})
            .where(eq(messageTemplates.id, id))
            .returning()
        if (!deleted) return c.json({error: 'Not found'}, 404)
        return c.json({success: true})
    })
    .post('/:id/duplicate', zValidator('json', z.object({name: z.string().trim().min(1).optional()})), async (c) => {
        const forbidden = requireAdmin(c)
        if (forbidden) return c.json(forbidden, 403)

        const id = c.req.param('id')
        const {name} = c.req.valid('json')
        const db = c.get('tenantDb')

        const original = await db.query.messageTemplates.findFirst({
            where: eq(messageTemplates.id, id),
        })
        if (!original) return c.json({error: 'Not found'}, 404)

        const [created] = await db
            .insert(messageTemplates)
            .values({
                name: name ?? `${original.name} copy`,
                category: original.category,
                reminderTiming: original.reminderTiming,
                channel: original.channel,
                body: original.body,
                isDefault: false,
                isActive: true,
                createdBy: c.get('userId'),
            })
            .returning()
        return c.json(created, 201)
    })

export default messageTemplatesRoute
