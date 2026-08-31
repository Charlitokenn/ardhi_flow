import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { createInsertSchema } from 'drizzle-zod'
import { eq, desc } from 'drizzle-orm'
import type { Env, Variables } from '../types'
import { expenses } from '../../../drizzle/tenant/schema'

const insertExpenseSchema = createInsertSchema(expenses).omit({ id: true, createdAt: true })

const expensesRoute = new Hono<{ Bindings: Env; Variables: Variables }>()
  .get('/', async (c) => {
    const rows = await c.get('tenantDb')
      .query.expenses.findMany({
        with: {
          account: true,
          payee: true,
          project: true,
        },
        orderBy: [desc(expenses.paidAt)],
      })
    return c.json(rows)
  })
  .post('/', zValidator('json', insertExpenseSchema), async (c) => {
    const input = c.req.valid('json')
    const [created] = await c.get('tenantDb').insert(expenses).values(input).returning()
    return c.json(created, 201)
  })
  .delete('/:id', async (c) => {
    const id = c.req.param('id')
    const [deleted] = await c.get('tenantDb')
      .delete(expenses)
      .where(eq(expenses.id, id))
      .returning()
    if (!deleted) return c.json({ error: 'Not found' }, 404)
    return c.json({ success: true })
  })

export default expensesRoute
