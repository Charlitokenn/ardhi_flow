import {Hono} from 'hono'
import {desc} from 'drizzle-orm'
import type {Env, Variables} from '../types'
import {commissionSettings} from '../../../drizzle/tenant/schema'

// Used when a tenant has no settings row yet (spec 0005, Value sourcing).
const FALLBACK = {
    defaultCommissionPercent: 5,
    defaultPayoutMonths: 1,
    defaultCancellationFeePercent: 10,
}

// Read only: prefills the New Contract sheet. There is no settings screen yet,
// and the table has no single row constraint, so the latest row wins.
const commissionSettingsRoute = new Hono<{ Bindings: Env; Variables: Variables }>()
    .get('/', async (c) => {
        const [row] = await c.get('tenantDb')
            .select()
            .from(commissionSettings)
            .orderBy(desc(commissionSettings.updatedAt))
            .limit(1)
        if (!row) return c.json(FALLBACK)
        return c.json({
            defaultCommissionPercent: Number(row.defaultCommissionPercent),
            defaultPayoutMonths: row.defaultPayoutMonths,
            defaultCancellationFeePercent: Number(row.defaultCancellationFeePercent),
        })
    })

export default commissionSettingsRoute
