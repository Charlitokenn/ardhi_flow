import {Hono} from 'hono'
import {zValidator} from '@hono/zod-validator'
import {createInsertSchema} from 'drizzle-zod'
import {and, asc, desc, eq} from 'drizzle-orm'
import {z} from 'zod'
import type {Env, Variables} from '../types'
import {
  commissionPayouts,
  contacts,
  contractInstallments,
  contractPayments,
  plots,
  plotSaleContracts
} from '../../../drizzle/tenant/schema'

const insertContactSchema = createInsertSchema(contacts).omit({id: true, createdAt: true, updatedAt: true})

// Bulk import never accepts isDeleted from the client either — it's server
// controlled, same as id/createdAt/updatedAt.
const bulkContactRowSchema = insertContactSchema.omit({isDeleted: true})

const bulkImportBodySchema = z.object({
    rows: z.array(z.record(z.string(), z.unknown())).min(1),
})

const onlyDigits = (value: string | null | undefined) => (value ?? '').replace(/\D/g, '')

const contactsRoute = new Hono<{ Bindings: Env; Variables: Variables }>()
    .get('/', async (c) => {
        const rows = await c.get('tenantDb')
            .query.contacts.findMany({
                where: eq(contacts.isDeleted, false),
                orderBy: [desc(contacts.createdAt)],
            })
        return c.json(rows)
    })
    // Registered ahead of `/:id` so "bulk" is never read as an id.
    .post('/bulk', zValidator('json', bulkImportBodySchema), async (c) => {
        const {rows} = c.req.valid('json')
        const tenantDb = c.get('tenantDb')

        const existingContacts = await tenantDb
            .query.contacts.findMany({
                where: eq(contacts.isDeleted, false),
                columns: {mobileNumber: true},
            })
        const existingDigits = new Set(
            existingContacts.map((row) => onlyDigits(row.mobileNumber)).filter((d) => d.length > 0)
        )
        const seenInFile = new Set<string>()

        const results: {
            row: number
            status: 'created' | 'skipped' | 'failed'
            reason?: string
            id?: string
        }[] = []
        let created = 0

        for (let i = 0; i < rows.length; i++) {
            const rowNumber = i + 1
            const parsed = bulkContactRowSchema.safeParse(rows[i])

            if (!parsed.success) {
                const fieldErrors = parsed.error.flatten().fieldErrors
                const reason = Object.entries(fieldErrors)
                    .map(([field, messages]) => `${field}: ${messages?.[0] ?? 'invalid'}`)
                    .join('; ') || 'Invalid row'
                results.push({row: rowNumber, status: 'failed', reason})
                continue
            }

            const digits = onlyDigits(parsed.data.mobileNumber)

            if (digits && existingDigits.has(digits)) {
                results.push({row: rowNumber, status: 'skipped', reason: 'Mobile number already exists'})
                continue
            }

            if (digits && seenInFile.has(digits)) {
                results.push({row: rowNumber, status: 'skipped', reason: 'Duplicate mobile number in file'})
                continue
            }

            const [insertedRow] = await tenantDb.insert(contacts).values(parsed.data).returning()
            if (digits) seenInFile.add(digits)
            created += 1
            results.push({row: rowNumber, status: 'created', id: insertedRow.id})
        }

        return c.json({created, results})
    })
    // A contact plus its plots, each plot's project, and each plot's latest
    // contract (with payments/installments/sales agent) — feeds the view
    // sheet, the client statement, and the confirmation letter. See
    // docs/specs/0001-contacts-completion/0002-contact-view-and-detail-data.md
    // for the "latest contract" rule this implements.
    // Also carries `plotSaleContractsAsAgent` — every contract this contact
    // earns commission on (as the sales agent, not the buyer), each with its
    // full commission payout schedule. Powers the "Commission Payments" tab.
    .get('/:id/statement-data', async (c) => {
        const id = c.req.param('id')
        const row = await c.get('tenantDb')
            .query.contacts.findFirst({
                where: and(eq(contacts.id, id), eq(contacts.isDeleted, false)),
                with: {
                    plots: {
                        where: eq(plots.isDeleted, false),
                        with: {
                            project: true,
                            contracts: {
                                // Most recent first, so contracts[0] is the fallback
                                // "latest contract" for a plot with no activeContractId.
                                orderBy: [
                                    desc(plotSaleContracts.startDate),
                                    desc(plotSaleContracts.createdAt),
                                    desc(plotSaleContracts.id),
                                ],
                                with: {
                                    payments: {orderBy: [asc(contractPayments.receivedAt)]},
                                    installments: {orderBy: [asc(contractInstallments.installmentNo)]},
                                    salesAgent: true,
                                },
                            },
                        },
                    },
                    plotSaleContractsAsAgent: {
                        orderBy: [
                            desc(plotSaleContracts.startDate),
                            desc(plotSaleContracts.createdAt),
                            desc(plotSaleContracts.id),
                        ],
                        with: {
                            plot: {with: {project: true}},
                            client: true,
                            commissionPayouts: {orderBy: [asc(commissionPayouts.trancheNumber)]},
                        },
                    },
                },
            })
        if (!row) return c.json({error: 'Not found'}, 404)

        const plotsOut = row.plots.map((plot) => {
            const {contracts: plotContracts, ...plotRest} = plot
            const activeContract = plot.activeContractId
                ? plotContracts.find((ct) => ct.id === plot.activeContractId)
                : undefined
            const latestContract = activeContract ?? plotContracts[0] ?? null
            return {...plotRest, latestContract}
        })

        return c.json({...row, plots: plotsOut})
    })
    .get('/:id', async (c) => {
        const id = c.req.param('id')
        const row = await c.get('tenantDb')
            .query.contacts.findFirst({
                where: and(eq(contacts.id, id), eq(contacts.isDeleted, false)),
            })
        if (!row) return c.json({error: 'Not found'}, 404)
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
            .set({...input, updatedAt: new Date()})
            .where(and(eq(contacts.id, id), eq(contacts.isDeleted, false)))
            .returning()
        if (!updated) return c.json({error: 'Not found'}, 404)
        return c.json(updated)
    })
    .delete('/:id', async (c) => {
        const id = c.req.param('id')
        const [deleted] = await c.get('tenantDb')
            .update(contacts)
            .set({isDeleted: true, updatedAt: new Date()})
            .where(eq(contacts.id, id))
            .returning()
        if (!deleted) return c.json({error: 'Not found'}, 404)
        return c.json({success: true})
    })

export default contactsRoute