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
    expenses,
    plots,
    plotSaleContracts,
    projectAcquisitionInstallments,
    projectAcquisitions,
    vendorJobs,
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
    //
    // A contract is now a bucket that can hold more than one plot (see
    // contractPlots in the schema), so a plot's contract history is reached
    // through contractPlots rather than a direct contracts[] array, and each
    // plot's `installments` here are that plot's own schedule specifically
    // (contractInstallments.plotId), not the whole bucket's — a client
    // statement for one plot should never show another plot's payment
    // lines just because they share a contract. `payments` stays bucket-
    // wide (a payment isn't "for" one plot — only its allocations are; see
    // contractPaymentAllocations) — see contract-balance.ts for the
    // follow-up this implies for balance/running-total math on a
    // multi-plot bucket.
    //
    // Also carries `plotSaleContractsAsAgent` — every contract this contact
    // earns commission on (as the sales agent, not the buyer), each with its
    // full commission payout schedule and every plot in its bucket. Powers
    // the "Commission Payments" tab.
    // Also carries `projectAcquisitionsAsSeller` — every project purchase deal
    // this contact sold as a LAND_SELLER, each with its payment installments
    // and the individual (expense) payments logged against each installment.
    // Powers the "Supplier Projects" tab. And `vendorJobs` — every job/
    // assignment given to this contact as a vendor (surveyor/auditor/ICT
    // support), each with its linked projects and logged payments. Powers the
    // "Assignments/Jobs" tab.
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
                            contractPlots: {
                                with: {
                                    contract: {
                                        with: {
                                            payments: {orderBy: [asc(contractPayments.receivedAt)]},
                                            salesAgent: true,
                                        },
                                    },
                                    // This plot's own schedule — not the whole
                                    // bucket's (see note above).
                                    installments: {orderBy: [asc(contractInstallments.installmentNo)]},
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
                            project: true,
                            contractPlots: {with: {plot: true}},
                            client: true,
                            commissionPayouts: {orderBy: [asc(commissionPayouts.trancheNumber)]},
                        },
                    },
                    projectAcquisitionsAsSeller: {
                        orderBy: [desc(projectAcquisitions.dealDate), desc(projectAcquisitions.createdAt)],
                        with: {
                            project: true,
                            installments: {
                                orderBy: [asc(projectAcquisitionInstallments.installmentNo)],
                                with: {
                                    // The actual dated cash payments logged against this
                                    // installment — same "raw payments, not the aggregate"
                                    // convention as `contractPayments` above.
                                    payments: {orderBy: [asc(expenses.paidAt)]},
                                },
                            },
                        },
                    },
                    vendorJobs: {
                        orderBy: [desc(vendorJobs.startDate), desc(vendorJobs.createdAt)],
                        with: {
                            payments: {orderBy: [asc(expenses.paidAt)]},
                            projectLinks: {with: {project: true}},
                        },
                    },
                },
            })
        if (!row) return c.json({error: 'Not found'}, 404)

        // "Most recent contract" ordering (startDate, then createdAt, then id,
        // all descending) has to happen here rather than in the query above —
        // those columns live on plotSaleContracts, reached through
        // contractPlots.contract, and a relational-query `orderBy` can only
        // reference columns on the table it's querying directly.
        const byMostRecentContract = (
            a: {contract: {startDate: string; createdAt: Date | null; id: string}},
            b: {contract: {startDate: string; createdAt: Date | null; id: string}},
        ) => {
            if (a.contract.startDate !== b.contract.startDate) {
                return a.contract.startDate > b.contract.startDate ? -1 : 1
            }
            const aCreated = a.contract.createdAt?.toISOString() ?? ''
            const bCreated = b.contract.createdAt?.toISOString() ?? ''
            if (aCreated !== bCreated) return aCreated > bCreated ? -1 : 1
            return a.contract.id > b.contract.id ? -1 : 1
        }

        const plotsOut = row.plots.map((plot) => {
            const {contractPlots: plotContractPlots, ...plotRest} = plot
            const sorted = [...plotContractPlots].sort(byMostRecentContract)
            const activeEntry = plot.activeContractId
                ? sorted.find((entry) => entry.contract.id === plot.activeContractId)
                : undefined
            const latestEntry = activeEntry ?? sorted[0] ?? null
            const latestContract = latestEntry
                ? {
                    ...latestEntry.contract,
                    // This plot's own share of the bucket's totalContractValue —
                    // see ClientContactContract.allocatedValue.
                    allocatedValue: latestEntry.allocatedValue,
                    // This plot's own schedule (see the query comment above) —
                    // shadows whatever `installments` the contract itself
                    // might otherwise have carried.
                    installments: latestEntry.installments,
                }
                : null
            return {...plotRest, latestContract}
        })

        const plotSaleContractsAsAgentOut = row.plotSaleContractsAsAgent.map((contract) => {
            const {contractPlots: agentContractPlots, ...contractRest} = contract
            return {
                ...contractRest,
                plots: agentContractPlots
                    .filter((entry) => !entry.cancelledAt)
                    .map((entry) => entry.plot),
            }
        })

        return c.json({...row, plots: plotsOut, plotSaleContractsAsAgent: plotSaleContractsAsAgentOut})
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