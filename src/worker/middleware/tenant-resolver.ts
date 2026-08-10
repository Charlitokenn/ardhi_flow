import { createMiddleware } from 'hono/factory'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { eq } from 'drizzle-orm'
import type { Env, Variables } from '../types'
import { getCatalogDb } from '../db/catalog'
import { tenantProjects } from '../../../drizzle/catalog/schema'
import { decryptConnectionString } from '../lib/crypto'

// KV is eventually consistent (~60s propagation) which is fine here: tenant
// connection info barely ever changes, and a stale cache hit just means an
// extra request or two lands on an old cache entry before the TTL clears it.
const CACHE_TTL_SECONDS = 300

// Runs after clerkAuth(), which guarantees c.get('orgId') is set.
export const tenantResolver = () =>
  createMiddleware<{ Bindings: Env; Variables: Variables }>(async (c, next) => {
    const orgId = c.get('orgId')
    const cacheKey = `conn:${orgId}`

    let connectionString = await c.env.TENANT_CACHE.get(cacheKey)

    if (!connectionString) {
      const catalogDb = getCatalogDb(c.env.CATALOG_DATABASE_URL)
      const [tenant] = await catalogDb
        .select()
        .from(tenantProjects)
        .where(eq(tenantProjects.orgId, orgId))
        .limit(1)

      if (!tenant) {
        return c.json({ error: 'Organization has no provisioned tenant yet' }, 404)
      }
      if (tenant.status !== 'active') {
        return c.json({ error: `Tenant is not active (status: ${tenant.status})` }, 409)
      }

      connectionString = await decryptConnectionString(
        tenant.encryptedConnectionString,
        c.env.TENANT_CONN_ENCRYPTION_KEY,
      )

      // Don't block the response on the cache write.
      c.executionCtx.waitUntil(
        c.env.TENANT_CACHE.put(cacheKey, connectionString, { expirationTtl: CACHE_TTL_SECONDS }),
      )
    }

    c.set('tenantDb', drizzle(neon(connectionString)))

    await next()
  })
