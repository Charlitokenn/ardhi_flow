import {Hono} from 'hono'
import {zValidator} from '@hono/zod-validator'
import {createInsertSchema} from 'drizzle-zod'
import {and, desc, eq} from 'drizzle-orm'
import {z} from 'zod'
import type {Env, Variables} from '../types'
import {contractEvents, contractInstallments} from '../../../drizzle/tenant/schema'

// Follow-up comments are logged as contractEvents rows (eventType:
// 'FOLLOWUP_COMMENT') scoped to one installment — see
// contractEvents.installmentId in the schema. contractId/installmentId/
// eventType/meta/isInternal are all set server-side rather than trusted
// from the client, so the only inputs are the message itself and who
// logged it.
const insertInstallmentCommentSchema = createInsertSchema(contractEvents)
    .omit({
        id: true,
        contractId: true,
        installmentId: true,
        eventType: true,
        meta: true,
        isInternal: true,
        createdAt: true,
    })
    .extend({
        message: z.string().trim().min(1, 'Message is required'),
    })

const updateInstallmentCommentSchema = z.object({
    message: z.string().trim().min(1, 'Message is required'),
})

// Powers the Reminder page's installment datagrid: every installment across
// every contract, flattened with just enough of the client / plot →
// project chain for the grid to render client/project names without a
// second round trip, plus any follow-up comments logged against that
// specific installment (see contractEvents.installmentId).
//
// Each installment now carries its own plotId (a multi-plot contract gets
// one full schedule per plot — see contractInstallments.plotId in the
// schema), so the plot is read directly off the installment rather than
// through the contract, which can no longer resolve to a single plot.
const installmentsRoute = new Hono<{ Bindings: Env; Variables: Variables }>()
    .get('/', async (c) => {
        const rows = await c.get('tenantDb')
            .query.contractInstallments.findMany({
                with: {
                    contract: {
                        with: {
                            client: true,
                        },
                    },
                    plot: {
                        with: {
                            project: true,
                        },
                    },
                    // Sorted client-side (there are only ever a handful per installment)
                    // to avoid coupling this route to the relational query builder's
                    // nested-orderBy typing.
                    comments: true,
                },
                orderBy: [desc(contractInstallments.dueDate)],
            })
        return c.json(rows)
    })
    // Logs a follow-up comment against one installment (Reminder page's
    // comments sheet). contractId is looked up server-side from the
    // installment rather than trusted from the client.
    .post('/:id/comments', zValidator('json', insertInstallmentCommentSchema), async (c) => {
        const installmentId = c.req.param('id')
        const input = c.req.valid('json')
        const db = c.get('tenantDb')

        const installment = await db.query.contractInstallments.findFirst({
            where: eq(contractInstallments.id, installmentId),
            columns: {id: true, contractId: true},
        })
        if (!installment) return c.json({error: 'Installment not found'}, 404)

        const [created] = await db
            .insert(contractEvents)
            .values({
                contractId: installment.contractId,
                installmentId: installment.id,
                eventType: 'FOLLOWUP_COMMENT',
                message: input.message,
                createdBy: input.createdBy ?? null,
            })
            .returning()

        return c.json(created, 201)
    })
    // Edits a follow-up comment's message in place. Scoped to the
    // installment (not just the comment id) so a comment can't be edited
    // through the wrong installment's sheet, and restricted to
    // FOLLOWUP_COMMENT rows — system-generated entries like
    // DELINQUENT_MARKED are part of the audit trail and aren't editable.
    .patch(
        '/:id/comments/:commentId',
        zValidator('json', updateInstallmentCommentSchema),
        async (c) => {
            const installmentId = c.req.param('id')
            const commentId = c.req.param('commentId')
            const {message} = c.req.valid('json')
            const db = c.get('tenantDb')

            const existing = await db.query.contractEvents.findFirst({
                where: and(
                    eq(contractEvents.id, commentId),
                    eq(contractEvents.installmentId, installmentId),
                ),
                columns: {id: true, eventType: true},
            })
            if (!existing) return c.json({error: 'Comment not found'}, 404)
            if (existing.eventType !== 'FOLLOWUP_COMMENT') {
                return c.json({error: 'Only follow-up comments can be edited'}, 400)
            }

            const [updated] = await db
                .update(contractEvents)
                .set({message})
                .where(eq(contractEvents.id, commentId))
                .returning()

            return c.json(updated)
        },
    )
    // Deletes a follow-up comment. Same installment-scoping and
    // FOLLOWUP_COMMENT-only restriction as the edit route above.
    .delete('/:id/comments/:commentId', async (c) => {
        const installmentId = c.req.param('id')
        const commentId = c.req.param('commentId')
        const db = c.get('tenantDb')

        const existing = await db.query.contractEvents.findFirst({
            where: and(
                eq(contractEvents.id, commentId),
                eq(contractEvents.installmentId, installmentId),
            ),
            columns: {id: true, eventType: true},
        })
        if (!existing) return c.json({error: 'Comment not found'}, 404)
        if (existing.eventType !== 'FOLLOWUP_COMMENT') {
            return c.json({error: 'Only follow-up comments can be deleted'}, 400)
        }

        const [deleted] = await db
            .delete(contractEvents)
            .where(eq(contractEvents.id, commentId))
            .returning()
        if (!deleted) return c.json({error: 'Comment not found'}, 404)

        return c.json({success: true})
    })

export default installmentsRoute