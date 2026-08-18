import { Hono } from 'hono'
import { logger } from 'hono/logger'
import type { Env, Variables } from './types'
import { clerkAuth } from './middleware/clerk-auth'
import { tenantResolver } from './middleware/tenant-resolver'
import webhooksRoute from './routes/webhooks/clerk'
import healthRoute from './routes/health'
import plotsRoute from './routes/plots'
import contactsRoute from './routes/contacts'
import projectsRoute from './routes/projects'
import accountsRoute from './routes/accounts'
import contractsRoute from './routes/contracts'
import paymentsRoute from './routes/payments'
import expensesRoute from './routes/expenses'
import dashboardRoute from './routes/dashboard'
import companySettingsRoute from './routes/company-settings'
import { handleTenantProvisionQueue, type ProvisionTenantMessage } from './queue/provision-tenant'

const app = new Hono<{ Bindings: Env; Variables: Variables }>()

app.use('*', logger())

// Public — webhooks verify their own signature; health needs no auth.
app.route('/api/webhooks', webhooksRoute)
app.route('/api/health', healthRoute)

// Everything else under /api requires a verified Clerk session with an
// active org, then gets a tenant-scoped Drizzle client attached to context.
const authed = new Hono<{ Bindings: Env; Variables: Variables }>()
  .use('*', clerkAuth())
  .use('*', tenantResolver())
  .route('/plots', plotsRoute)
  .route('/contacts', contactsRoute)
  .route('/projects', projectsRoute)
  .route('/accounts', accountsRoute)
  .route('/contracts', contractsRoute)
  .route('/payments', paymentsRoute)
  .route('/expenses', expensesRoute)
  .route('/dashboard', dashboardRoute)
  .route('/company-settings', companySettingsRoute)

const routes = app.route('/api', authed)

// Exported for the frontend's Hono RPC client: `hc<AppType>(baseUrl)` gives
// fully typed requests/responses with zero codegen. See src/client's API
// client setup.
export type AppType = typeof routes

export default {
  fetch: routes.fetch,
  queue: handleTenantProvisionQueue,
} satisfies ExportedHandler<Env, ProvisionTenantMessage>
