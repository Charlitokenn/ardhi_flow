import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { createInsertSchema } from 'drizzle-zod'
import { eq, and, desc } from 'drizzle-orm'
import type { Env, Variables } from '../types'
import { contacts } from '../../../drizzle/tenant/schema'

const insertContactSchema = createInsertSchema(contacts).omit({ id: true, createdAt: true, updatedAt: true })

const contactsRoute = new Hono<{ Bindings: Env; Variables: Variables }>()
  .get('/', async (c) => {
    const rows = await c.get('tenantDb')
      .query.contacts.findMany({
        where: eq(contacts.isDeleted, false),
        orderBy: [desc(contacts.createdAt)],
      })
    return c.json(rows)
  })
  .get('/:id', async (c) => {
    const id = c.req.param('id')
    const row = await c.get('tenantDb')
      .query.contacts.findFirst({
        where: and(eq(contacts.id, id), eq(contacts.isDeleted, false)),
      })
    if (!row) return c.json({ error: 'Not found' }, 404)
    return c.json(row)
  })
  .post('/', zValidator('json', insertContactSchema), async (c) => {
    const input = c.req.valid('json')
    const [created] = await c.get('tenantDb').insert(contacts).values(input).returning()
    return c.json(created, 201)
  })
  .patch('/:id', zValidator('json', insertContactSchema.partial()), async (c) => {
    const id = c.req.param('id')
    const input = c.req.valid('json')
    const [updated] = await c.get('tenantDb')
      .update(contacts)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(contacts.id, id), eq(contacts.isDeleted, false)))
      .returning()
    if (!updated) return c.json({ error: 'Not found' }, 404)
    return c.json(updated)
  })
  .delete('/:id', async (c) => {
    const id = c.req.param('id')
    const [deleted] = await c.get('tenantDb')
      .update(contacts)
      .set({ isDeleted: true, updatedAt: new Date() })
      .where(eq(contacts.id, id))
      .returning()
    if (!deleted) return c.json({ error: 'Not found' }, 404)
    return c.json({ success: true })
  })

export default contactsRoute
