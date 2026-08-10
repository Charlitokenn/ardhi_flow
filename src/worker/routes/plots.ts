import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { createInsertSchema } from 'drizzle-zod'
import type { Env, Variables } from '../types'
import { plots } from '../../../drizzle/tenant/schema'

const insertPlotSchema = createInsertSchema(plots).omit({ id: true, createdAt: true })

const plotsRoute = new Hono<{ Bindings: Env; Variables: Variables }>()
  .get('/', async (c) => {
    const rows = await c.get('tenantDb').select().from(plots)
    return c.json(rows)
  })
  .post('/', zValidator('json', insertPlotSchema), async (c) => {
    const input = c.req.valid('json')
    const [created] = await c.get('tenantDb').insert(plots).values(input).returning()
    return c.json(created, 201)
  })

export default plotsRoute
