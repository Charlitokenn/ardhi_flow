import {Hono} from 'hono'
import {asc, desc, isNotNull} from 'drizzle-orm'
import type {Env, Variables} from '../types'
import {commissionPayouts, plotSaleContracts} from '../../../drizzle/tenant/schema'

// Every plot-sale contract that has a sales agent attached — org-wide, not
// scoped to one contact — each with its full commission payout schedule and
// every plot still live in its bucket (cancelled ones dropped, same as
// contacts.ts's statement-data endpoint). Powers the Commissions grid at
// finance/commissions. Deliberately the same row shape as
// ClientContactAsAgentContract (see types/contacts.ts) plus `salesAgent`,
// since this view has no single contact "owning" it the way the Commission
// Payments tab on a contact does — every row needs to say whose commission
// it is.
const commissionsRoute = new Hono<{ Bindings: Env; Variables: Variables }>()
    .get('/', async (c) => {
        const rows = await c.get('tenantDb')
            .query.plotSaleContracts.findMany({
                where: isNotNull(plotSaleContracts.salesAgentContactId),
                orderBy: [
                    desc(plotSaleContracts.startDate),
                    desc(plotSaleContracts.createdAt),
                    desc(plotSaleContracts.id),
                ],
                with: {
                    project: true,
                    client: true,
                    salesAgent: true,
                    contractPlots: {with: {plot: true}},
                    commissionPayouts: {orderBy: [asc(commissionPayouts.trancheNumber)]},
                },
            })

        const out = rows.map((contract) => {
            const {contractPlots, ...rest} = contract
            return {
                ...rest,
                plots: contractPlots
                    .filter((entry) => !entry.cancelledAt)
                    .map((entry) => entry.plot),
            }
        })

        return c.json(out)
    })

export default commissionsRoute
