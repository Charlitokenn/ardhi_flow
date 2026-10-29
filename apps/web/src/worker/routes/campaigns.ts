import {Hono} from 'hono'
import {zValidator} from '@hono/zod-validator'
import {and, asc, desc, eq, isNotNull, sql} from 'drizzle-orm'
import {z} from 'zod'
import {
    normaliseTzMobile,
    smsAudienceSchema,
    smsCampaignInputSchema,
    smsSkippedSchema,
    type SmsCampaignInput,
} from '@ardhiflow/shared-schema'
import type {Env, Variables} from '../types'
import {contacts, messageTemplates, smsCampaigns, smsMessages} from '../../../drizzle/tenant/schema'
import {loadSmsSettings, SMS_NOT_CONFIGURED, type LoadedSmsSettings} from '../lib/sms-settings'
import {mapSendReplyStatus} from '../lib/nextsms'
import {randomUrlToken} from '../lib/crypto'
import type {TenantDb} from '../lib/tenant-db'
import {resolveAudience, type ResolvedAudience} from '../lib/sms-audience'
import {batchRefFor, SMS_CHUNK_SIZE, type SmsSendMessage} from '../queue/send-sms'
import {
    findDueItemsForContact,
    firstNameOf,
    renderMessageTemplate,
    SAMPLE_FIRST_NAME,
    sampleDueItems,
} from '../lib/message-templates'

// The list is from docs/specs/0003-connect-broadcast-dashboard. Drafts, the
// audience preview and the test send are docs/specs/0004-sms-send-flow.

const reminderTimingSchema = z.enum(['UPCOMING', 'DUE_TODAY', 'PAST_DUE'])

const testSendBodySchema = z.object({
    phoneNumber: z.string().min(1),
    templateBody: z.string().trim().min(1),
    // Omitted: render for spec 0002's sample client instead.
    contactId: z.string().uuid().optional(),
    reminderTiming: reminderTimingSchema.nullable().optional(),
})

const idParamSchema = z.object({id: z.string().uuid()})
const detailQuerySchema = z.object({page: z.coerce.number().int().min(1).default(1)})

// Recipients per page in the campaign detail sheet.
const DETAIL_PAGE_SIZE = 100
const previewBodySchema = smsCampaignInputSchema.omit({name: true})

// Cost guard on test sends: 10 per member per UTC hour (AC-4). KV is
// eventually consistent, so a burst can slip slightly past 10; that is
// acceptable for this purpose (spec, Webhook and sweep).
const TEST_SENDS_PER_HOUR = 10

// AC-11: one campaign never sends to more than this many people.
export const MAX_RECIPIENTS = 5000
// AC-10: the estimate plus this margin must fit in the balance.
export const BALANCE_MARGIN = 1.02

// "sent" means accepted by NextSMS. The same meanings are used by the
// dashboard grid and the campaign detail sheet.
const SENT_STATUSES = new Set(['SENT', 'DELIVERED', 'UNDELIVERED', 'EXPIRED'])

type RuleError = {error: string; message: string}

// The checks every save and preview share (AC-6). When a template is chosen
// it decides both the type and the reminder timing (frozen into the
// audience), so a mismatch or a {dueItems} body with no timing is refused.
async function applyCampaignRules(
    db: TenantDb,
    input: Omit<SmsCampaignInput, 'name'>,
): Promise<{ok: true; audience: SmsCampaignInput['audience']} | {ok: false; body: RuleError}> {
    let reminderTiming: SmsCampaignInput['audience']['reminderTiming'] = null
    if (input.templateId) {
        const template = await db.query.messageTemplates.findFirst({
            where: and(eq(messageTemplates.id, input.templateId), eq(messageTemplates.isDeleted, false)),
            columns: {category: true, reminderTiming: true},
        })
        if (!template) return {ok: false, body: {error: 'invalid', message: 'That template no longer exists'}}
        if (template.category !== input.type) {
            return {
                ok: false,
                body: {error: 'type_mismatch', message: `A campaign from this template must be of type ${template.category}`},
            }
        }
        reminderTiming = template.reminderTiming
    }
    if (input.templateBody.includes('{dueItems}') && !reminderTiming) {
        return {
            ok: false,
            body: {error: 'timing_required', message: 'A message that uses {dueItems} needs a reminder template with a timing'},
        }
    }
    if (input.audience.segment === 'DUE' && !reminderTiming) {
        return {
            ok: false,
            body: {error: 'timing_required', message: 'The due installments audience needs a reminder template with a timing'},
        }
    }
    return {ok: true, audience: {...input.audience, reminderTiming}}
}

export type CostEstimate =
    | {ok: true; estimatedCost: number; smsBalance: number; display: string; balanceSufficient: boolean}
    | {ok: false; error: 'price_unavailable' | 'nextsms_unavailable'; message: string}

// Price per segment from one free validation send (the first recipient's
// text), times the total segments, against the live balance. Re-run at send.
export async function estimateCost(settings: LoadedSmsSettings, resolved: ResolvedAudience): Promise<CostEstimate> {
    const first = resolved.recipients[0]
    const [balance, priceCheck] = await Promise.all([
        settings.getBalance(),
        first
            ? settings.client.sendSingle({from: settings.senderId, to: first.phone, text: first.text, test: true})
            : Promise.resolve(null),
    ])
    if (!balance.ok || (priceCheck && !priceCheck.ok)) {
        return {ok: false, error: 'nextsms_unavailable', message: 'Could not reach NextSMS, try again'}
    }

    let estimatedCost = 0
    if (priceCheck?.ok) {
        const reply = priceCheck.data.messages?.[0]
        const price = Number(reply?.price)
        const parts = Number(reply?.smsCount) || first?.segments || 1
        // Never estimate 0 for a real audience: a missing price blocks the send.
        if (!price || price <= 0) {
            return {ok: false, error: 'price_unavailable', message: 'NextSMS did not return a price for this message'}
        }
        estimatedCost = Math.round((price / parts) * resolved.totalSegments * 100) / 100
    }

    const smsBalance = Number(balance.data.sms_balance) || 0
    return {
        ok: true,
        estimatedCost,
        smsBalance,
        display: balance.data.display ?? `TZS ${smsBalance.toLocaleString('en-US')}`,
        balanceSufficient: estimatedCost * BALANCE_MARGIN <= smsBalance,
    }
}

// Reads a stored campaign row back through the shared schemas, so rows saved
// before spec 0004 (audience `{}`, no skipped) still come out complete.
function toCampaignResponse(row: typeof smsCampaigns.$inferSelect) {
    return {
        id: row.id,
        name: row.name,
        type: row.type,
        status: row.status,
        templateId: row.templateId,
        templateBody: row.templateBody,
        audience: smsAudienceSchema.parse(row.audience ?? {}),
        skipped: row.skipped ? smsSkippedSchema.parse(row.skipped) : null,
        recipientCount: row.recipientCount,
        senderId: row.senderId,
        sentAt: row.sentAt,
        sentBy: row.sentBy,
        createdBy: row.createdBy,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    }
}

const campaignsRoute = new Hono<{ Bindings: Env; Variables: Variables }>()
    .get('/', async (c) => {
        const db = c.get('tenantDb')

        const [campaigns, counts] = await Promise.all([
            db.query.smsCampaigns.findMany({
                where: eq(smsCampaigns.isDeleted, false),
                orderBy: [desc(smsCampaigns.createdAt)],
                columns: {
                    id: true,
                    name: true,
                    type: true,
                    status: true,
                    recipientCount: true,
                    templateId: true,
                    templateBody: true,
                    audience: true,
                    createdAt: true,
                },
            }),
            // Counted in SQL, one row per (campaign, status), instead of
            // loading every message.
            db
                .select({
                    campaignId: smsMessages.campaignId,
                    status: smsMessages.status,
                    count: sql<number>`count(*)::int`,
                })
                .from(smsMessages)
                .where(isNotNull(smsMessages.campaignId))
                .groupBy(smsMessages.campaignId, smsMessages.status),
        ])

        // "Sent" = accepted by NextSMS; SMS has no read-receipt concept, so
        // "Delivered" (not "seen") is the honest second stat — carriers
        // report delivery, never whether someone read it.
        const statsByCampaignId = new Map<string, {sent: number; delivered: number; failed: number}>()
        for (const row of counts) {
            if (!row.campaignId) continue
            const stats = statsByCampaignId.get(row.campaignId) ?? {sent: 0, delivered: 0, failed: 0}
            const count = Number(row.count)
            if (SENT_STATUSES.has(row.status)) stats.sent += count
            if (row.status === 'DELIVERED') stats.delivered += count
            if (row.status === 'FAILED') stats.failed += count
            statsByCampaignId.set(row.campaignId, stats)
        }

        const rows = campaigns.map((campaign) => ({
            ...campaign,
            audience: smsAudienceSchema.parse(campaign.audience ?? {}),
            sentCount: statsByCampaignId.get(campaign.id)?.sent ?? 0,
            deliveredCount: statsByCampaignId.get(campaign.id)?.delivered ?? 0,
            failedCount: statsByCampaignId.get(campaign.id)?.failed ?? 0,
        }))

        return c.json(rows)
    })
    // Saves a new DRAFT (AC-5). Any member can.
    .post('/', zValidator('json', smsCampaignInputSchema), async (c) => {
        const input = c.req.valid('json')
        const db = c.get('tenantDb')

        const rules = await applyCampaignRules(db, input)
        if (!rules.ok) return c.json(rules.body, 422)

        const [created] = await db
            .insert(smsCampaigns)
            .values({
                name: input.name,
                type: input.type,
                templateId: input.templateId ?? null,
                templateBody: input.templateBody,
                audience: rules.audience,
                status: 'DRAFT',
                createdBy: c.get('userId'),
            })
            .returning()
        return c.json(toCampaignResponse(created), 201)
    })
    // Registered ahead of `/:id` routes, same convention as message-templates.ts's
    // `/preview`. Works from unsaved rules so the audience step updates as staff
    // edit, and everything is worked out now, not when the draft was saved (AC-7).
    .post('/audience-preview', zValidator('json', previewBodySchema), async (c) => {
        const input = c.req.valid('json')
        const db = c.get('tenantDb')

        const settings = await loadSmsSettings(c.env, db, c.get('keyring'), c.get('orgId'))
        if (!settings) return c.json(SMS_NOT_CONFIGURED, 409)

        const rules = await applyCampaignRules(db, input)
        if (!rules.ok) return c.json(rules.body, 422)

        const resolved = await resolveAudience(db, {type: input.type, templateBody: input.templateBody, audience: rules.audience})
        if (resolved.recipients.length > MAX_RECIPIENTS) {
            return c.json({
                error: 'audience_too_large',
                message: `A campaign can reach at most ${MAX_RECIPIENTS.toLocaleString('en-US')} people (this one has ${resolved.recipients.length.toLocaleString('en-US')})`,
            }, 422)
        }

        const cost = await estimateCost(settings, resolved)
        if (!cost.ok) return c.json({error: cost.error, message: cost.message}, 502)

        return c.json({
            recipients: resolved.recipients.map(({contactId, name, phone}) => ({contactId, name, phone})),
            skipped: resolved.skipped,
            skippedCounts: resolved.skippedCounts,
            totalSegments: resolved.totalSegments,
            estimatedCost: cost.estimatedCost,
            balance: {smsBalance: cost.smsBalance, display: cost.display},
            // AC-10, worked out here so the margin rule lives in one place.
            balanceSufficient: cost.balanceSufficient,
            reminderTiming: rules.audience.reminderTiming,
        })
    })
    // Sends the current message to one typed number through the tenant's real
    // NextSMS account (AC-3, AC-4). Logged as an sms_messages row with no campaign.
    .post('/test-send', zValidator('json', testSendBodySchema), async (c) => {
        const {phoneNumber, templateBody, contactId, reminderTiming = null} = c.req.valid('json')
        const db = c.get('tenantDb')
        const orgId = c.get('orgId')

        const settings = await loadSmsSettings(c.env, db, c.get('keyring'), orgId)
        if (!settings) return c.json(SMS_NOT_CONFIGURED, 409)

        const to = normaliseTzMobile(phoneNumber)
        if (!to) {
            return c.json({error: 'invalid_number', message: 'Enter a Tanzanian mobile number, e.g. 0712 345 678'}, 422)
        }
        if (templateBody.includes('{dueItems}') && !reminderTiming) {
            return c.json({error: 'timing_required', message: 'A message that uses {dueItems} needs a reminder timing'}, 422)
        }

        let firstName = SAMPLE_FIRST_NAME
        let dueItems = sampleDueItems(reminderTiming)
        if (contactId) {
            const contact = await db.query.contacts.findFirst({
                where: and(eq(contacts.id, contactId), eq(contacts.isDeleted, false)),
                columns: {fullName: true},
            })
            if (!contact) return c.json({error: 'not_found', message: 'Contact not found'}, 404)
            firstName = firstNameOf(contact.fullName)
            dueItems = reminderTiming ? await findDueItemsForContact(db, contactId, reminderTiming) : []
        }
        const rendered = renderMessageTemplate({body: templateBody, reminderTiming}, {firstName, dueItems})

        // Counted before the send, so a send that fails still uses up a slot.
        const hour = new Date().toISOString().slice(0, 13)
        const limitKey = `smstest:${orgId}:${c.get('userId')}:${hour}`
        const used = Number(await c.env.TENANT_CACHE.get(limitKey)) || 0
        if (used >= TEST_SENDS_PER_HOUR) {
            return c.json({error: 'rate_limited', message: `At most ${TEST_SENDS_PER_HOUR} test messages per hour`}, 429)
        }
        await c.env.TENANT_CACHE.put(limitKey, String(used + 1), {expirationTtl: 3600})

        // Price from the free validation endpoint, against the live balance.
        const [priceCheck, balance] = await Promise.all([
            settings.client.sendSingle({from: settings.senderId, to, text: rendered.text, test: true}),
            settings.getBalance(),
        ])
        if (!priceCheck.ok || !balance.ok) {
            return c.json({error: 'nextsms_unavailable', message: 'Could not reach NextSMS, try again'}, 502)
        }
        // Whether the validation endpoint returns a real price is unconfirmed
        // (spec Follow-up). Without one, a test send only needs a balance above 0.
        const price = Number(priceCheck.data.messages?.[0]?.price) || 0
        const smsBalance = Number(balance.data.sms_balance) || 0
        if (smsBalance <= 0 || smsBalance < price) {
            return c.json({error: 'insufficient_balance', message: 'The NextSMS balance is too low for this message'}, 422)
        }

        const sent = await settings.client.sendSingle({
            from: settings.senderId,
            to,
            text: rendered.text,
            reference: `t${randomUrlToken(12).replace(/[-_]/g, '')}`,
        })

        const reply = sent.ok ? sent.data.messages?.find((m) => m.to === to) ?? sent.data.messages?.[0] : undefined
        const outcome = sent.ok
            ? mapSendReplyStatus(reply?.status)
            : {
                status: 'FAILED' as const,
                // An unknown outcome may still have been delivered, so it is never resent.
                errorReason: sent.kind === 'refused' ? sent.message : 'unconfirmed, check NextSMS',
            }

        await db.insert(smsMessages).values({
            campaignId: null,
            contactId: contactId ?? null,
            phoneNumber: to,
            body: rendered.text,
            status: outcome.status,
            errorReason: outcome.errorReason,
            providerMessageId: reply?.messageId ?? null,
            providerStatus: reply?.status?.name ?? null,
            cost: reply?.price != null ? String(reply.price) : null,
            segmentsCount: reply?.smsCount ?? rendered.segmentCount,
            sentAt: outcome.status === 'SENT' ? new Date() : null,
        })

        // Org id and status only. Never the number in full, or the text.
        console.log(`[test-send] org ${orgId} status=${outcome.status} to=***${to.slice(-3)}`)

        if (!sent.ok && sent.kind === 'unknown') {
            return c.json({error: 'nextsms_unavailable', message: 'NextSMS did not confirm the message, check NextSMS before retrying'}, 502)
        }
        return c.json({status: outcome.status, errorReason: outcome.errorReason})
    })

    // Sends the saved draft (AC-10, AC-11). Works only on what is stored: the
    // compose flow saves first. Returns once the messages are QUEUED; the
    // send-sms queue consumer hands them to NextSMS in the background.
    .post('/:id/send', zValidator('param', idParamSchema), async (c) => {
        const {id} = c.req.valid('param')
        const db = c.get('tenantDb')
        const orgId = c.get('orgId')

        const settings = await loadSmsSettings(c.env, db, c.get('keyring'), orgId)
        if (!settings) return c.json(SMS_NOT_CONFIGURED, 409)

        const draft = await db.query.smsCampaigns.findFirst({
            where: and(eq(smsCampaigns.id, id), eq(smsCampaigns.isDeleted, false)),
        })
        if (!draft) return c.json({error: 'not_found', message: 'Campaign not found'}, 404)
        if (draft.status !== 'DRAFT') {
            return c.json({error: 'not_draft', message: 'This campaign has already been sent'}, 409)
        }

        // Worked out again now, from the saved rules (AC-7).
        const resolved = await resolveAudience(db, {
            type: draft.type,
            templateBody: draft.templateBody,
            audience: smsAudienceSchema.parse(draft.audience ?? {}),
        })
        if (resolved.recipients.length === 0) {
            return c.json({error: 'empty_audience', message: 'Nobody would receive this campaign'}, 422)
        }
        if (resolved.recipients.length > MAX_RECIPIENTS) {
            return c.json({
                error: 'audience_too_large',
                message: `A campaign can reach at most ${MAX_RECIPIENTS.toLocaleString('en-US')} people`,
            }, 422)
        }

        // Checked again even after a passing preview: the balance may have moved.
        const cost = await estimateCost(settings, resolved)
        if (!cost.ok) return c.json({error: cost.error, message: cost.message}, 502)
        if (!cost.balanceSufficient) {
            return c.json({error: 'insufficient_balance', message: 'The NextSMS balance does not cover this campaign'}, 422)
        }

        // The claim: DRAFT -> SENDING exactly once, and only while no other
        // campaign in this tenant is SENDING. The totals are written in the
        // same statement (State transitions).
        const [claimed] = await db
            .update(smsCampaigns)
            .set({
                status: 'SENDING',
                recipientCount: resolved.recipients.length,
                skipped: resolved.skippedCounts,
                senderId: settings.senderId,
                sentAt: new Date(),
                sentBy: c.get('userId'),
                updatedAt: new Date(),
            })
            .where(and(
                eq(smsCampaigns.id, id),
                eq(smsCampaigns.status, 'DRAFT'),
                eq(smsCampaigns.isDeleted, false),
                sql`NOT EXISTS (SELECT 1 FROM sms_campaigns AS other WHERE other.status = 'SENDING')`,
            ))
            .returning({id: smsCampaigns.id})
        if (!claimed) {
            const current = await db.query.smsCampaigns.findFirst({
                where: eq(smsCampaigns.id, id),
                columns: {status: true},
            })
            if (current?.status !== 'DRAFT') {
                return c.json({error: 'not_draft', message: 'This campaign has already been sent'}, 409)
            }
            return c.json({
                error: 'another_send_in_progress',
                message: 'Another campaign is still sending. Try again in a few minutes.',
            }, 409)
        }

        // Frozen as QUEUED rows, 500 per chunk, then one queue message per chunk.
        const chunks: SmsSendMessage[] = []
        try {
            for (let start = 0, index = 0; start < resolved.recipients.length; start += SMS_CHUNK_SIZE, index++) {
                const batchRef = batchRefFor(id, index)
                const slice = resolved.recipients.slice(start, start + SMS_CHUNK_SIZE)
                await db.insert(smsMessages).values(slice.map((r) => ({
                    campaignId: id,
                    contactId: r.contactId,
                    phoneNumber: r.phone,
                    body: r.text,
                    status: 'QUEUED' as const,
                    segmentsCount: r.segments,
                    batchRef,
                })))
                chunks.push({orgId, campaignId: id, batchRef})
            }
            await c.env.SMS_SEND_QUEUE.sendBatch(chunks.map((body) => ({body})))
        } catch (err) {
            // Put things back as they were. If the Worker dies before this
            // runs, the delivery sweep re-enqueues the stored rows (AC-13).
            console.error(`[campaign-send] org ${orgId} campaign ${id}: could not queue (${err instanceof Error ? err.name : 'error'})`)
            await db.delete(smsMessages).where(and(eq(smsMessages.campaignId, id), eq(smsMessages.status, 'QUEUED')))
            await db
                .update(smsCampaigns)
                .set({status: 'DRAFT', recipientCount: 0, skipped: null, sentAt: null, sentBy: null, updatedAt: new Date()})
                .where(and(eq(smsCampaigns.id, id), eq(smsCampaigns.status, 'SENDING')))
            return c.json({error: 'send_failed', message: 'The campaign could not be queued. Nothing was sent, try again.'}, 502)
        }

        console.log(`[campaign-send] org ${orgId} campaign ${id}: ${resolved.recipients.length} queued in ${chunks.length} chunk(s)`)
        return c.json({status: 'SENDING' as const, recipientCount: resolved.recipients.length}, 202)
    })
    // The campaign detail sheet (AC-17): counts grouped from the messages at
    // read time (never stored), the skip counts written at send, and one page
    // of recipients.
    .get('/:id', zValidator('param', idParamSchema), zValidator('query', detailQuerySchema), async (c) => {
        const {id} = c.req.valid('param')
        const {page} = c.req.valid('query')
        const db = c.get('tenantDb')

        const campaign = await db.query.smsCampaigns.findFirst({
            where: and(eq(smsCampaigns.id, id), eq(smsCampaigns.isDeleted, false)),
        })
        if (!campaign) return c.json({error: 'not_found', message: 'Campaign not found'}, 404)

        const [grouped, messages] = await Promise.all([
            db
                .select({status: smsMessages.status, count: sql<number>`count(*)::int`})
                .from(smsMessages)
                .where(eq(smsMessages.campaignId, id))
                .groupBy(smsMessages.status),
            db
                .select({
                    id: smsMessages.id,
                    contactName: contacts.fullName,
                    phoneNumber: smsMessages.phoneNumber,
                    status: smsMessages.status,
                    errorReason: smsMessages.errorReason,
                    sentAt: smsMessages.sentAt,
                    deliveredAt: smsMessages.deliveredAt,
                })
                .from(smsMessages)
                .leftJoin(contacts, eq(contacts.id, smsMessages.contactId))
                .where(eq(smsMessages.campaignId, id))
                .orderBy(asc(smsMessages.createdAt), asc(smsMessages.id))
                .limit(DETAIL_PAGE_SIZE)
                .offset((page - 1) * DETAIL_PAGE_SIZE),
        ])

        const counts = {queued: 0, sent: 0, delivered: 0, failed: 0, undelivered: 0, expired: 0}
        for (const row of grouped) {
            counts[row.status.toLowerCase() as keyof typeof counts] = Number(row.count)
        }
        const totalMessages = Object.values(counts).reduce((sum, n) => sum + n, 0)

        return c.json({
            campaign: toCampaignResponse(campaign),
            counts,
            // The same meanings as the dashboard grid: "sent" = accepted by NextSMS.
            summary: {
                sent: counts.sent + counts.delivered + counts.undelivered + counts.expired,
                delivered: counts.delivered,
                failed: counts.failed,
            },
            skipped: campaign.skipped ? smsSkippedSchema.parse(campaign.skipped) : null,
            messages,
            page,
            pageSize: DETAIL_PAGE_SIZE,
            totalMessages,
        })
    })
    // Only a DRAFT can change. The update itself is conditional on DRAFT, so
    // it can never land after a send has claimed the campaign (AC-5).
    .patch('/:id', zValidator('param', idParamSchema), zValidator('json', smsCampaignInputSchema.partial()), async (c) => {
        const {id} = c.req.valid('param')
        const input = c.req.valid('json')
        const db = c.get('tenantDb')

        const existing = await db.query.smsCampaigns.findFirst({
            where: and(eq(smsCampaigns.id, id), eq(smsCampaigns.isDeleted, false)),
        })
        if (!existing) return c.json({error: 'not_found', message: 'Campaign not found'}, 404)
        if (existing.status !== 'DRAFT') {
            return c.json({error: 'not_draft', message: 'Only a draft campaign can be edited'}, 409)
        }

        const merged: SmsCampaignInput = {
            name: input.name ?? existing.name,
            type: input.type ?? existing.type,
            templateId: input.templateId !== undefined ? input.templateId : existing.templateId,
            templateBody: input.templateBody ?? existing.templateBody,
            audience: input.audience ?? smsAudienceSchema.parse(existing.audience ?? {}),
        }
        const rules = await applyCampaignRules(db, merged)
        if (!rules.ok) return c.json(rules.body, 422)

        const [updated] = await db
            .update(smsCampaigns)
            .set({
                name: merged.name,
                type: merged.type,
                templateId: merged.templateId ?? null,
                templateBody: merged.templateBody,
                audience: rules.audience,
                updatedAt: new Date(),
            })
            .where(and(eq(smsCampaigns.id, id), eq(smsCampaigns.status, 'DRAFT'), eq(smsCampaigns.isDeleted, false)))
            .returning()
        if (!updated) return c.json({error: 'not_draft', message: 'Only a draft campaign can be edited'}, 409)
        return c.json(toCampaignResponse(updated))
    })
    // Soft delete, drafts only (AC-5).
    .delete('/:id', zValidator('param', idParamSchema), async (c) => {
        const {id} = c.req.valid('param')
        const db = c.get('tenantDb')

        const [deleted] = await db
            .update(smsCampaigns)
            .set({isDeleted: true, updatedAt: new Date()})
            .where(and(eq(smsCampaigns.id, id), eq(smsCampaigns.status, 'DRAFT'), eq(smsCampaigns.isDeleted, false)))
            .returning({id: smsCampaigns.id})
        if (deleted) return c.json({ok: true as const})

        // Nothing changed: tell a missing campaign from one that isn't a draft.
        const existing = await db.query.smsCampaigns.findFirst({
            where: and(eq(smsCampaigns.id, id), eq(smsCampaigns.isDeleted, false)),
            columns: {status: true},
        })
        if (!existing) return c.json({error: 'not_found', message: 'Campaign not found'}, 404)
        return c.json({error: 'not_draft', message: 'Only a draft campaign can be deleted'}, 409)
    })

export default campaignsRoute
