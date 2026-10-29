import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { createInsertSchema } from 'drizzle-zod'
import { and, eq, desc, inArray, isNull, sql } from 'drizzle-orm'
import {
  buildContractPlan,
  createContractBodySchema,
  issuesToFields,
  listPrice,
  plotSizeUsed,
  startDateWindow,
  todayInContractTimeZone,
} from '@ardhiflow/shared-schema'
import type { Env, Variables } from '../types'
import type { TenantDb } from '../lib/tenant-db'
import {
  commissionPayouts,
  contacts,
  contractEvents,
  contractInstallments,
  contractPlots,
  plotSaleContracts,
  plots,
} from '../../../drizzle/tenant/schema'

const insertContractSchema = createInsertSchema(plotSaleContracts).omit({ id: true, createdAt: true, updatedAt: true })
const updateContractSchema = insertContractSchema.omit({
  projectId: true,
  status: true,
  completedAt: true,
  cancelledAt: true,
  cancelledBy: true,
  cancellationFeeAmount: true,
  refundedAmount: true,
  cancellationReason: true,
}).partial()

// Neon reports the violated constraint on its error. Drizzle may wrap driver
// errors as `cause`, and Neon nests the failed fetch as `sourceError`.
function violatedConstraint(err: unknown): string | null {
  let current: unknown = err
  for (let depth = 0; depth < 8 && current instanceof Error; depth++) {
    const record = current as unknown as Record<string, unknown>
    if (typeof record.constraint === 'string') return record.constraint
    current = record.cause ?? record.sourceError
  }
  return null
}

type ContractSummary = {
  id: string
  totalContractValue: number
  downpaymentAmount: number
  financedAmount: number
  commissionAmount: number
}

async function findContractSummary(db: TenantDb, id: string): Promise<ContractSummary | null> {
  const [row] = await db
    .select({
      id: plotSaleContracts.id,
      totalContractValue: plotSaleContracts.totalContractValue,
      downpaymentAmount: plotSaleContracts.downpaymentAmount,
      financedAmount: plotSaleContracts.financedAmount,
      commissionAmount: plotSaleContracts.commissionAmount,
    })
    .from(plotSaleContracts)
    .where(eq(plotSaleContracts.id, id))
    .limit(1)
  if (!row) return null
  return {
    id: row.id,
    totalContractValue: Number(row.totalContractValue),
    downpaymentAmount: Number(row.downpaymentAmount),
    financedAmount: Number(row.financedAmount),
    commissionAmount: Number(row.commissionAmount),
  }
}

// Plot numbers among `plotIds` that can no longer be sold (AC-10).
async function unavailablePlotNumbers(db: TenantDb, plotIds: string[]): Promise<string[]> {
  const [plotRows, liveRows] = await Promise.all([
    db.select().from(plots).where(inArray(plots.id, plotIds)),
    db
      .select({ plotId: contractPlots.plotId })
      .from(contractPlots)
      .where(and(inArray(contractPlots.plotId, plotIds), isNull(contractPlots.cancelledAt))),
  ])
  const live = new Set(liveRows.map((row) => row.plotId))
  return plotRows
    .filter((plot) => plot.isDeleted || plot.availability !== 'AVAILABLE' || plot.activeContractId || live.has(plot.id))
    .map((plot) => plot.plotNumber)
}

const contractsRoute = new Hono<{ Bindings: Env; Variables: Variables }>()
  .get('/', async (c) => {
    const rows = await c.get('tenantDb')
      .query.plotSaleContracts.findMany({
        with: {
          project: true,
          contractPlots: {
            with: {plot: true},
          },
          client: true,
          installments: true,
        },
        orderBy: [desc(plotSaleContracts.createdAt)],
      })
    return c.json(rows)
  })
  .get('/:id', async (c) => {
    const id = c.req.param('id')
    const row = await c.get('tenantDb')
      .query.plotSaleContracts.findFirst({
        where: eq(plotSaleContracts.id, id),
        with: {
          project: true,
          contractPlots: {
            with: {plot: true},
          },
          client: true,
          installments: true,
          payments: true,
          events: true,
          commissionPayouts: true,
        },
      })
    if (!row) return c.json({ error: 'Not found' }, 404)
    return c.json(row)
  })
  // Records a sale: the contract, its plots, every installment, the commission
  // tranches, a CREATED event, and the plots marked SOLD, all in one
  // db.batch() (one transaction). The server takes only the agreed prices and
  // the terms; it recomputes every amount with the same buildContractPlan the
  // sheet previews with. See docs/specs/0005-sales-contract-creation.
  .post(
    '/',
    zValidator('json', createContractBodySchema, (result, c) => {
      // zValidator answers 400 by default; this API's contract is 422.
      if (!result.success) {
        return c.json({ error: 'invalid' as const, fields: issuesToFields(result.error.issues) }, 422)
      }
    }),
    async (c) => {
      const body = c.req.valid('json')
      const db = c.get('tenantDb')
      const userId = c.get('userId')
      const contractId = body.id
      const agentId = body.salesAgentContactId ?? null

      // A repeat of a request that already saved (double click, retry after a
      // timeout) gets that contract back rather than a 409 about its own plots.
      const saved = await findContractSummary(db, contractId)
      if (saved) return c.json(saved, 200)

      const plotIds = body.plots.map((plot) => plot.plotId)
      const [plotRows, liveRows, contactRows] = await Promise.all([
        db.select().from(plots).where(inArray(plots.id, plotIds)),
        db
          .select({ plotId: contractPlots.plotId })
          .from(contractPlots)
          .where(and(inArray(contractPlots.plotId, plotIds), isNull(contractPlots.cancelledAt))),
        db
          .select({ id: contacts.id, contactType: contacts.contactType, isDeleted: contacts.isDeleted })
          .from(contacts)
          .where(inArray(contacts.id, agentId ? [body.clientContactId, agentId] : [body.clientContactId])),
      ])

      const fields: Record<string, string> = {}

      const { min, max } = startDateWindow(todayInContractTimeZone())
      if (body.startDate < min || body.startDate > max) {
        fields.startDate = `The start date must be between ${min} and ${max}`
      }

      const client = contactRows.find((row) => row.id === body.clientContactId)
      if (!client || client.isDeleted || client.contactType !== 'CLIENT') {
        fields.clientContactId = 'Pick a client contact'
      }
      if (agentId) {
        const agent = contactRows.find((row) => row.id === agentId)
        if (!agent || agent.isDeleted || agent.contactType !== 'SALES_AGENT') {
          fields.salesAgentContactId = 'Pick a sales agent contact'
        }
      }

      const plotById = new Map(plotRows.map((plot) => [plot.id, plot]))
      const live = new Set(liveRows.map((row) => row.plotId))
      const unavailable: string[] = []
      body.plots.forEach(({ plotId }, index) => {
        const plot = plotById.get(plotId)
        const path = `plots.${index}.plotId`
        if (!plot) {
          fields[path] = 'Plot not found'
        } else if (plot.projectId !== body.projectId) {
          fields[path] = 'This plot belongs to another project'
        } else if (plot.isDeleted || plot.availability !== 'AVAILABLE' || plot.activeContractId || live.has(plotId)) {
          unavailable.push(plot.plotNumber)
        } else if (plot.pricePerSqm == null) {
          fields[path] = 'Set a price per sqm on the plot first'
        }
      })

      const plan = buildContractPlan({
        purchasePlan: body.purchasePlan,
        termMonths: body.termMonths,
        startDate: body.startDate,
        downpaymentPercent: body.downpaymentPercent ?? null,
        plots: body.plots,
        // Without an agent, any commission fields sent are ignored (AC-6).
        commission: agentId
          ? { percent: body.commissionPercent ?? 0, payoutMonths: body.commissionPayoutMonths ?? 1 }
          : null,
      })
      for (const issue of plan.issues) fields[issue.path] ??= issue.message

      if (Object.keys(fields).length > 0) return c.json({ error: 'invalid' as const, fields }, 422)
      if (unavailable.length > 0) return c.json({ error: 'plots_unavailable' as const, plotNumbers: unavailable }, 409)

      // Child rows reference these inside the one batch, so every id is made here.
      const contractPlotIds = plan.plots.map(() => crypto.randomUUID())

      const plotValues = sql.join(
        plan.plots.map(
          (planned, index) =>
            sql`(${contractPlotIds[index]}::uuid, ${planned.plotId}::uuid, ${String(planned.allocatedValue)}::numeric)`,
        ),
        sql`, `,
      )

      const snapshot = plan.plots.map((planned) => {
        const plot = plotById.get(planned.plotId)!
        const { size, basis } = plotSizeUsed(plot)
        return {
          plotId: plot.id,
          plotNumber: plot.plotNumber,
          sizeUsed: size,
          basis,
          pricePerSqm: plot.pricePerSqm,
          listPrice: plot.pricePerSqm == null ? null : listPrice(size, plot.pricePerSqm),
          agreedPrice: planned.allocatedValue,
        }
      })

      const installmentRows = plan.plots.flatMap((planned, index) =>
        planned.installments.map((installment) => ({
          id: crypto.randomUUID(),
          contractId,
          contractPlotId: contractPlotIds[index],
          plotId: planned.plotId,
          installmentNo: installment.installmentNo,
          originalDueDate: installment.dueDate,
          dueDate: installment.dueDate,
          amountDue: String(installment.amount),
        })),
      )

      const statements = [
        db.insert(plotSaleContracts).values({
          id: contractId,
          projectId: body.projectId,
          clientContactId: body.clientContactId,
          createdBy: userId,
          status: 'ACTIVE',
          startDate: body.startDate,
          termMonths: body.termMonths,
          totalContractValue: String(plan.totalContractValue),
          purchasePlan: body.purchasePlan,
          downpaymentPercent: plan.downpaymentPercent == null ? null : String(plan.downpaymentPercent),
          downpaymentAmount: String(plan.downpaymentAmount),
          financedAmount: String(plan.financedAmount),
          cancellationFeePercent: String(body.cancellationFeePercent),
          salesAgentContactId: agentId,
          commissionPercent: String(plan.commissionPercent),
          commissionAmount: String(plan.commissionAmount),
          commissionPayoutMonths: plan.commissionPayoutMonths,
        }),
        // Guarded: a plot sold, deleted or moved since the reads above is not
        // updated, and the update locks the rows it does touch.
        db
          .update(plots)
          .set({ availability: 'SOLD', activeContractId: contractId, contactId: body.clientContactId, updatedAt: new Date() })
          .where(
            and(
              inArray(plots.id, plotIds),
              eq(plots.availability, 'AVAILABLE'),
              eq(plots.isDeleted, false),
              eq(plots.projectId, body.projectId),
              isNull(plots.activeContractId),
            ),
          ),
        // Only plots the update above claimed get a contract plot row. A plot
        // it skipped has none, so its installments fail the composite foreign
        // key below and the whole batch rolls back.
        db.execute(sql`
          insert into contract_plots (id, contract_id, plot_id, allocated_value)
          select v.id, ${contractId}::uuid, p.id, v.allocated_value
          from plots p
          join (values ${plotValues}) as v (id, plot_id, allocated_value) on v.plot_id = p.id
          where p.active_contract_id = ${contractId}::uuid
        `),
        db.insert(contractInstallments).values(installmentRows),
        ...(agentId && plan.tranches.length > 0
          ? [
              db.insert(commissionPayouts).values(
                plan.tranches.map((tranche) => ({
                  id: crypto.randomUUID(),
                  contractId,
                  salesAgentContactId: agentId,
                  trancheNumber: tranche.trancheNumber,
                  amount: String(tranche.amount),
                  targetMonth: tranche.targetMonth,
                })),
              ),
            ]
          : []),
        db.insert(contractEvents).values({
          id: crypto.randomUUID(),
          contractId,
          eventType: 'CREATED',
          message: 'Contract created',
          meta: { plots: snapshot },
          isInternal: true,
          createdBy: userId,
        }),
      ]

      try {
        await db.batch(statements as [(typeof statements)[number], ...(typeof statements)[number][]])
      } catch (err) {
        const constraint = violatedConstraint(err)
        if (constraint === 'plot_sale_contracts_pkey') {
          // The same request saved in between the check above and this batch.
          const raced = await findContractSummary(db, contractId)
          if (raced) return c.json(raced, 200)
        }
        if (constraint === 'contract_plots_plot_active_unique' || constraint === 'contract_installments_contract_plot_plot_fk') {
          const plotNumbers = await unavailablePlotNumbers(db, plotIds)
          return c.json(
            {
              error: 'plots_unavailable' as const,
              plotNumbers: plotNumbers.length > 0 ? plotNumbers : plotRows.map((plot) => plot.plotNumber),
            },
            409,
          )
        }
        console.error(`[contracts] create failed: ${constraint ?? (err instanceof Error ? err.name : 'error')}`)
        throw err
      }

      const created: ContractSummary = {
        id: contractId,
        totalContractValue: plan.totalContractValue,
        downpaymentAmount: plan.downpaymentAmount,
        financedAmount: plan.financedAmount,
        commissionAmount: plan.commissionAmount,
      }
      return c.json(created, 201)
    },
  )
  .patch('/:id', zValidator('json', updateContractSchema), async (c) => {
    const id = c.req.param('id')
    const input = c.req.valid('json')
    const [updated] = await c.get('tenantDb')
      .update(plotSaleContracts)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(plotSaleContracts.id, id))
      .returning()
    if (!updated) return c.json({ error: 'Not found' }, 404)
    return c.json(updated)
  })
  // A delete here would hard delete the contract, cascade its installments and
  // payments, and leave its plots SOLD. Gated until the cancellation feature
  // exists (spec 0005, Follow-up).
  .delete('/:id', async (c) => {
    return c.json({ error: 'Cancellation is not available yet' }, 409)
  })

export default contractsRoute
