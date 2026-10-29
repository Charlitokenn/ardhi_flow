import {Hono} from 'hono'
import {zValidator} from '@hono/zod-validator'
import {createInsertSchema} from 'drizzle-zod'
import {and, desc, eq} from 'drizzle-orm'
import {z} from 'zod'
import type {Env, Variables} from '../types'
import {plots} from '../../../drizzle/tenant/schema'

// availability, activeContractId and contactId change only through the sale
// write (POST /contracts), never from a plot body (spec 0005, AC-4).
const insertPlotSchema = createInsertSchema(plots).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    availability: true,
    activeContractId: true,
    contactId: true,
})

// drizzle-zod maps `numeric` to a plain string with no number check, so the
// rate is checked here: a whole number of shillings above 0, or unset.
const PRICE_PER_SQM_ERROR = 'pricePerSqm must be a whole number of shillings greater than 0'
function isInvalidPricePerSqm(value: string | null | undefined): boolean {
    return value != null && !/^[1-9]\d*$/.test(value)
}

// Bulk import schema — mirrors projects.ts: isDeleted is never accepted from
// a bulk row (rows always come in as active), everything else (including
// projectId, which the client injects per-row before posting) is validated
// the same way a single POST /plots would be.
const bulkPlotRowSchema = insertPlotSchema.omit({isDeleted: true})

const bulkImportBodySchema = z.object({
    rows: z.array(z.record(z.string(), z.unknown())).min(1),
})

const plotsRoute = new Hono<{ Bindings: Env; Variables: Variables }>()
    .get('/', async (c) => {
        const rows = await c.get('tenantDb')
            .query.plots.findMany({
                where: eq(plots.isDeleted, false),
                with: {
                    project: true,
                    contact: true,
                    activeContract: true,
                },
                orderBy: [desc(plots.createdAt)],
            })
        return c.json(rows)
    })
    // Registered ahead of `/:id` so "bulk" is never read as an id.
    .post('/bulk', zValidator('json', bulkImportBodySchema), async (c) => {
        const {rows} = c.req.valid('json')
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
            const parsed = bulkPlotRowSchema.safeParse(rows[i])

            if (!parsed.success) {
                const fieldErrors = parsed.error.flatten().fieldErrors
                const reason = Object.entries(fieldErrors)
                    .map(([field, messages]) => `${field}: ${messages?.[0] ?? 'invalid'}`)
                    .join('; ') || 'Invalid row'
                results.push({row: rowNumber, status: 'failed', reason})
                continue
            }
            if (isInvalidPricePerSqm(parsed.data.pricePerSqm)) {
                results.push({row: rowNumber, status: 'failed', reason: PRICE_PER_SQM_ERROR})
                continue
            }

            try {
                const [insertedRow] = await tenantDb.insert(plots).values(parsed.data).returning()
                created += 1
                results.push({row: rowNumber, status: 'created', id: insertedRow.id})
            } catch (err) {
                const reason = err instanceof Error ? err.message : 'Insert failed'
                results.push({row: rowNumber, status: 'failed', reason})
            }
        }

        return c.json({created, results})
    })
    .get('/:id', async (c) => {
        const id = c.req.param('id')
        const row = await c.get('tenantDb')
            .query.plots.findFirst({
                where: and(eq(plots.id, id), eq(plots.isDeleted, false)),
                with: {
                    project: true,
                    contact: true,
                    activeContract: true,
                },
            })
        if (!row) return c.json({error: 'Not found'}, 404)
        return c.json(row)
    })
    .post('/', zValidator('json', insertPlotSchema), async (c) => {
        const input = c.req.valid('json')
        if (isInvalidPricePerSqm(input.pricePerSqm)) return c.json({error: PRICE_PER_SQM_ERROR}, 422)
        const [created] = await c.get('tenantDb').insert(plots).values(input).returning()
        return c.json(created, 201)
    })
    .patch('/:id', zValidator('json', insertPlotSchema.partial()), async (c) => {
        const id = c.req.param('id')
        const input = c.req.valid('json')
        if (isInvalidPricePerSqm(input.pricePerSqm)) return c.json({error: PRICE_PER_SQM_ERROR}, 422)
        const [updated] = await c.get('tenantDb')
            .update(plots)
            .set({...input, updatedAt: new Date()})
            .where(and(eq(plots.id, id), eq(plots.isDeleted, false)))
            .returning()
        if (!updated) return c.json({error: 'Not found'}, 404)
        return c.json(updated)
    })
    .delete('/:id', async (c) => {
        const id = c.req.param('id')
        const [deleted] = await c.get('tenantDb')
            .update(plots)
            .set({isDeleted: true, updatedAt: new Date()})
            .where(eq(plots.id, id))
            .returning()
        if (!deleted) return c.json({error: 'Not found'}, 404)
        return c.json({success: true})
    })

export default plotsRoute