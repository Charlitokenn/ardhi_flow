import {Hono} from 'hono'
import {desc} from 'drizzle-orm'
import type {Env, Variables} from '../types'
import {smsCampaigns} from '../../../drizzle/tenant/schema'

// Read-only for now — see docs/specs/0003-connect-broadcast-dashboard. Create,
// update, delete, and send are all out of scope here; they belong to the
// separate NextSMS send-flow decision (scope feature 10).
const campaignsRoute = new Hono<{ Bindings: Env; Variables: Variables }>()
    .get('/', async (c) => {
        const db = c.get('tenantDb')

        const [campaigns, messages] = await Promise.all([
            db.query.smsCampaigns.findMany({
                orderBy: [desc(smsCampaigns.createdAt)],
                columns: {
                    id: true,
                    name: true,
                    type: true,
                    status: true,
                    recipientCount: true,
                    templateBody: true,
                    createdAt: true,
                },
            }),
            // Fetched once and counted in JS rather than a grouped SQL count —
            // matches installments.ts's own "fetch everything, group here"
            // convention, and nothing sends real messages yet, so this table
            // is empty in practice today.
            db.query.smsMessages.findMany({
                columns: {campaignId: true, status: true},
            }),
        ])

        // "Sent" = left QUEUED at all; SMS has no read-receipt concept, so
        // "Delivered" (not "seen") is the honest second stat — carriers
        // report delivery, never whether someone read it.
        const statsByCampaignId = new Map<string, {sent: number; delivered: number}>()
        for (const message of messages) {
            if (!message.campaignId) continue
            const stats = statsByCampaignId.get(message.campaignId) ?? {sent: 0, delivered: 0}
            if (message.status !== 'QUEUED') stats.sent += 1
            if (message.status === 'DELIVERED') stats.delivered += 1
            statsByCampaignId.set(message.campaignId, stats)
        }

        const rows = campaigns.map((campaign) => ({
            ...campaign,
            sentCount: statsByCampaignId.get(campaign.id)?.sent ?? 0,
            deliveredCount: statsByCampaignId.get(campaign.id)?.delivered ?? 0,
        }))

        return c.json(rows)
    })

export default campaignsRoute
