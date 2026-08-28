import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { createInsertSchema } from 'drizzle-zod'
import { eq, desc } from 'drizzle-orm'
import type { Env, Variables } from '../types'
import { plotSaleContracts } from '../../../drizzle/tenant/schema'

const insertContractSchema = createInsertSchema(plotSaleContracts).omit({ id: true, createdAt: true, updatedAt: true })

const contractsRoute = new Hono<{ Bindings: Env; Variables: Variables }>()
  .get('/', async (c) => {
    const rows = await c.get('tenantDb')
      .query.plotSaleContracts.findMany({
        with: {
          project: true,
          contractPlots: {
            with: {plot: true},
          },
          client: true,
          installments: true,
        },
        orderBy: [desc(plotSaleContracts.createdAt)],
      })
    return c.json(rows)
  })
  .get('/:id', async (c) => {
    const id = c.req.param('id')
    const row = await c.get('tenantDb')
      .query.plotSaleContracts.findFirst({
        where: eq(plotSaleContracts.id, id),
        with: {
          project: true,
          contractPlots: {
            with: {plot: true},
          },
          client: true,
          installments: true,
          payments: true,
          events: true,
          commissionPayouts: true,
        },
      })
    if (!row) return c.json({ error: 'Not found' }, 404)
    return c.json(row)
  })
  // NOTE: this now only creates the plotSaleContracts row itself (client,
  // project, terms). It does NOT attach any plots — creating a contract's
  // bucket also needs one contractPlots row per plot (each with its own
  // allocatedValue, summing to totalContractValue, and each plot's
  // projectId validated against this contract's projectId) plus that
  // plot's installment schedule. That flow doesn't exist yet anywhere in
  // this codebase — build it as its own transactional step (e.g. a
  // `plots: {plotId, allocatedValue}[]` array on the request body, handled
  // in a `db.transaction(...)` here) rather than assuming insertContractSchema
  // alone is enough to stand up a real contract.
  .post('/', zValidator('json', insertContractSchema), async (c) => {
    const input = c.req.valid('json')
    const [created] = await c.get('tenantDb').insert(plotSaleContracts).values(input).returning()
    return c.json(created, 201)
  })
  .patch('/:id', zValidator('json', insertContractSchema.partial()), async (c) => {
    const id = c.req.param('id')
    const input = c.req.valid('json')
    const [updated] = await c.get('tenantDb')
      .update(plotSaleContracts)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(plotSaleContracts.id, id))
      .returning()
    if (!updated) return c.json({ error: 'Not found' }, 404)
    return c.json(updated)
  })
  .delete('/:id', async (c) => {
    const id = c.req.param('id')
    const [deleted] = await c.get('tenantDb')
      .delete(plotSaleContracts)
      .where(eq(plotSaleContracts.id, id))
      .returning()
    if (!deleted) return c.json({ error: 'Not found' }, 404)
    return c.json({ success: true })
  })

export default contractsRoute
