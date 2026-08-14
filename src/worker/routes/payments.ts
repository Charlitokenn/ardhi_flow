import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { createInsertSchema } from 'drizzle-zod'
import { desc } from 'drizzle-orm'
import type { Env, Variables } from '../types'
import { contractPayments } from '../../../drizzle/tenant/schema'

const insertPaymentSchema = createInsertSchema(contractPayments).omit({ id: true, createdAt: true })

const paymentsRoute = new Hono<{ Bindings: Env; Variables: Variables }>()
  .get('/', async (c) => {
    const rows = await c.get('tenantDb')
      .query.contractPayments.findMany({
        with: {
          contract: {
            with: {
              plot: true,
            },
          },
          client: true,
          account: true,
          allocations: true,
        },
        orderBy: [desc(contractPayments.receivedAt)],
      })
    return c.json(rows)
  })
  .post('/', zValidator('json', insertPaymentSchema), async (c) => {
    const input = c.req.valid('json')
    const [created] = await c.get('tenantDb').insert(contractPayments).values(input).returning()
    return c.json(created, 201)
  })

export default paymentsRoute
