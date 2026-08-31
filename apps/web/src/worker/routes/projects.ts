import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { createInsertSchema } from 'drizzle-zod'
import { eq, and, asc, desc } from 'drizzle-orm'
import { z } from 'zod'
import type { Env, Variables } from '../types'
import { expenses, plots, projectAcquisitions, projects } from '../../../drizzle/tenant/schema'

const insertProjectSchema = createInsertSchema(projects).omit({ id: true, createdAt: true, updatedAt: true })

// Bulk import schema
const bulkProjectRowSchema = insertProjectSchema.omit({ isDeleted: true })

const bulkImportBodySchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).min(1),
})

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
  // Registered ahead of `/:id` so "bulk" is never read as an id.
  .post('/bulk', zValidator('json', bulkImportBodySchema), async (c) => {
    const { rows } = c.req.valid('json')
    const tenantDb = c.get('tenantDb')

    const results: {
      row: number
      status: 'created' | 'skipped' | 'failed'
      reason?: string
      id?: string
    }[] = []
    let created = 0

    for (let i = 0; i < rows.length; i++) {
      const rowNumber = i + 1
      const parsed = bulkProjectRowSchema.safeParse(rows[i])

      if (!parsed.success) {
        const fieldErrors = parsed.error.flatten().fieldErrors
        const reason = Object.entries(fieldErrors)
          .map(([field, messages]) => `${field}: ${messages?.[0] ?? 'invalid'}`)
          .join('; ') || 'Invalid row'
        results.push({ row: rowNumber, status: 'failed', reason })
        continue
      }

      const [insertedRow] = await tenantDb.insert(projects).values(parsed.data).returning()
      created += 1
      results.push({ row: rowNumber, status: 'created', id: insertedRow.id })
    }

    return c.json({ created, results })
  })
  // A project plus its plots (each with its current holding contact), its
  // acquisition deals, and every LAND_ACQUISITION expense logged directly
  // against it (each with the payee/supplier contact) — feeds the view
  // sheet's Overview (Project Payments) and Plots tabs. See
  // types/projects.ts's `ClientProject` for the shape this returns.
  .get('/:id/statement-data', async (c) => {
    const id = c.req.param('id')
    const row = await c.get('tenantDb')
      .query.projects.findFirst({
        where: and(eq(projects.id, id), eq(projects.isDeleted, false)),
        with: {
          plots: {
            where: eq(plots.isDeleted, false),
            orderBy: [asc(plots.plotNumber)],
            with: {
              contact: true,
            },
          },
          acquisitions: {
            orderBy: [desc(projectAcquisitions.dealDate), desc(projectAcquisitions.createdAt)],
          },
          expenses: {
            where: eq(expenses.category, 'LAND_ACQUISITION'),
            orderBy: [asc(expenses.paidAt)],
            with: {
              payee: true,
            },
          },
        },
      })
    if (!row) return c.json({ error: 'Not found' }, 404)

    // Rename `expenses` -> `payments` to match the Project Payments tab's
    // vocabulary (and ClientProject's shape) rather than the raw relation name.
    const { expenses: payments, ...rest } = row
    return c.json({ ...rest, payments })
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
