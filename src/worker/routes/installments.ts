import { Hono } from 'hono'
import { desc } from 'drizzle-orm'
import type { Env, Variables } from '../types'
import { contractInstallments } from '../../../drizzle/tenant/schema'

// Powers the Reminder page's installment datagrid: every installment across
// every contract, flattened with just enough of the contract → client /
// plot → project chain for the grid to render client/project names without
// a second round trip, plus any follow-up comments logged against that
// specific installment (see contractEvents.installmentId).
const installmentsRoute = new Hono<{ Bindings: Env; Variables: Variables }>()
  .get('/', async (c) => {
    const rows = await c.get('tenantDb')
      .query.contractInstallments.findMany({
        with: {
          contract: {
            with: {
              client: true,
              plot: {
                with: {
                  project: true,
                },
              },
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

export default installmentsRoute
