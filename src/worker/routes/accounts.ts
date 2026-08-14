import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { createInsertSchema } from 'drizzle-zod'
import { eq, and, desc } from 'drizzle-orm'
import type { Env, Variables } from '../types'
import { accounts } from '../../../drizzle/tenant/schema'

const insertAccountSchema = createInsertSchema(accounts).omit({ id: true, createdAt: true, updatedAt: true })

const accountsRoute = new Hono<{ Bindings: Env; Variables: Variables }>()
  .get('/', async (c) => {
    const rows = await c.get('tenantDb')
      .query.accounts.findMany({
        where: eq(accounts.isDeleted, false),
        orderBy: [desc(accounts.createdAt)],
      })
    return c.json(rows)
  })
  .get('/:id', async (c) => {
    const id = c.req.param('id')
    const row = await c.get('tenantDb')
      .query.accounts.findFirst({
        where: and(eq(accounts.id, id), eq(accounts.isDeleted, false)),
      })
    if (!row) return c.json({ error: 'Not found' }, 404)
    return c.json(row)
  })
  .post('/', zValidator('json', insertAccountSchema), async (c) => {
    const input = c.req.valid('json')
    const [created] = await c.get('tenantDb').insert(accounts).values(input).returning()
    return c.json(created, 201)
  })
  .patch('/:id', zValidator('json', insertAccountSchema.partial()), async (c) => {
    const id = c.req.param('id')
    const input = c.req.valid('json')
    const [updated] = await c.get('tenantDb')
      .update(accounts)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(accounts.id, id), eq(accounts.isDeleted, false)))
      .returning()
    if (!updated) return c.json({ error: 'Not found' }, 404)
    return c.json(updated)
  })
  .delete('/:id', async (c) => {
    const id = c.req.param('id')
    const [deleted] = await c.get('tenantDb')
      .update(accounts)
      .set({ isDeleted: true, updatedAt: new Date() })
      .where(eq(accounts.id, id))
      .returning()
    if (!deleted) return c.json({ error: 'Not found' }, 404)
    return c.json({ success: true })
  })

export default accountsRoute
