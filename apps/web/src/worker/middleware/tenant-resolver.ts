import { createMiddleware } from 'hono/factory'
import type { Env, Variables } from '../types'
import { KeyringError } from '../lib/crypto'
import { getTenantDbForOrg } from '../lib/tenant-db'

// Runs after clerkAuth(), which guarantees c.get('orgId') is set. The lookup
// itself (KV cache, then the catalog, then decrypt) lives in
// lib/tenant-db.ts so non HTTP entry points open a tenant the same way.
export const tenantResolver = () =>
  createMiddleware<{ Bindings: Env; Variables: Variables }>(async (c, next) => {
    let result
    try {
      result = await getTenantDbForOrg(c.env, c.get('orgId'), c.executionCtx)
    } catch (err) {
      if (!(err instanceof KeyringError)) throw err
      // The message names the problem, never key material.
      console.error(`[tenant-resolver] ${err.message}`)
      return c.json({ error: 'Server configuration error' }, 500)
    }

    if (!result.ok) {
      if (result.reason === 'no_tenant') {
        return c.json({ error: 'Organization has no provisioned tenant yet' }, 404)
      }
      if (result.reason === 'inactive') {
        return c.json({ error: `Tenant is not active (status: ${result.status})` }, 409)
      }
      return c.json({ error: 'Tenant connection is unavailable' }, 500)
    }

    c.set('tenantDb', result.db)
    c.set('keyring', result.keyring)

    await next()
  })
