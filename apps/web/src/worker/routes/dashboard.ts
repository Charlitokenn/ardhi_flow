import { Hono } from 'hono'
import { eq, and, sql, count, sum, lt } from 'drizzle-orm'
import type { Env, Variables } from '../types'
import { 
  plots, 
  plotSaleContracts, 
  contractPayments, 
  contractInstallments 
} from '../../../drizzle/tenant/schema'

const dashboardRoute = new Hono<{ Bindings: Env; Variables: Variables }>()
  .get('/', async (c) => {
    const db = c.get('tenantDb')
    
    // Plots summary
    const [plotStats] = await db
      .select({
        total: count(),
        available: count(sql`CASE WHEN ${plots.availability} = 'AVAILABLE' THEN 1 END`),
        sold: count(sql`CASE WHEN ${plots.availability} = 'SOLD' THEN 1 END`),
      })
      .from(plots)
      .where(eq(plots.isDeleted, false))

    // Contract value summary
    const [contractStats] = await db
      .select({
        totalValue: sum(plotSaleContracts.totalContractValue),
        activeCount: count(sql`CASE WHEN ${plotSaleContracts.status} IN ('ACTIVE', 'DELINQUENT') THEN 1 END`),
      })
      .from(plotSaleContracts)

    // Payments summary
    const [paymentStats] = await db
      .select({
        totalCollected: sum(contractPayments.amount),
      })
      .from(contractPayments)
      .where(eq(contractPayments.direction, 'IN'))

    // Overdue installments
    const today = new Date().toISOString().split('T')[0]
    const [overdueStats] = await db
      .select({
        overdueCount: count(),
      })
      .from(contractInstallments)
      .where(
        and(
          eq(contractInstallments.status, 'DUE'),
          lt(contractInstallments.dueDate, today)
        )
      )

    const totalValue = parseFloat(contractStats?.totalValue || '0')
    const totalCollected = parseFloat(paymentStats?.totalCollected || '0')
    const outstandingBalance = totalValue - totalCollected

    return c.json({
      plots: {
        total: plotStats?.total || 0,
        available: plotStats?.available || 0,
        sold: plotStats?.sold || 0,
      },
      contracts: {
        activeCount: contractStats?.activeCount || 0,
        totalValue,
        totalCollected,
        outstandingBalance,
      },
      overdueInstallmentsCount: overdueStats?.overdueCount || 0,
    })
  })

export default dashboardRoute
