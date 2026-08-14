import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { createInsertSchema } from 'drizzle-zod'
import { eq, and, desc } from 'drizzle-orm'
import type { Env, Variables } from '../types'
import { projects } from '../../../drizzle/tenant/schema'

const insertProjectSchema = createInsertSchema(projects).omit({ id: true, createdAt: true, updatedAt: true })

const projectsRoute = new Hono<{ Bindings: Env; Variables: Variables }>()
  .get('/', async (c) => {
    const rows = await c.get('tenantDb')
      .query.projects.findMany({
        where: eq(projects.isDeleted, false),
        with: {
          plots: true,
        },
        orderBy: [desc(projects.createdAt)],
      })
    return c.json(rows)
  })
  .get('/:id', async (c) => {
    const id = c.req.param('id')
    const row = await c.get('tenantDb')
      .query.projects.findFirst({
        where: and(eq(projects.id, id), eq(projects.isDeleted, false)),
        with: {
          plots: true,
        },
      })
    if (!row) return c.json({ error: 'Not found' }, 404)
    return c.json(row)
  })
  .post('/', zValidator('json', insertProjectSchema), async (c) => {
    const input = c.req.valid('json')
    const [created] = await c.get('tenantDb').insert(projects).values(input).returning()
    return c.json(created, 201)
  })
  .patch('/:id', zValidator('json', insertProjectSchema.partial()), async (c) => {
    const id = c.req.param('id')
    const input = c.req.valid('json')
    const [updated] = await c.get('tenantDb')
      .update(projects)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(projects.id, id), eq(projects.isDeleted, false)))
      .returning()
    if (!updated) return c.json({ error: 'Not found' }, 404)
    return c.json(updated)
  })
  .delete('/:id', async (c) => {
    const id = c.req.param('id')
    const [deleted] = await c.get('tenantDb')
      .update(projects)
      .set({ isDeleted: true, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning()
    if (!deleted) return c.json({ error: 'Not found' }, 404)
    return c.json({ success: true })
  })

export default projectsRoute
