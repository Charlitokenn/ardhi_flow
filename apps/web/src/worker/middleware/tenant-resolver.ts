import { createMiddleware } from 'hono/factory'
import { drizzle } from 'drizzle-orm/neon-http'
import { eq } from 'drizzle-orm'
import type { Env, Variables } from '../types'
import { getCatalogDb } from '../db/catalog'
import { tenantProjects } from '../../../drizzle/catalog/schema'
import {
  ConnectionStringDecryptError,
  KeyringError,
  decryptConnectionString,
  parseKeyring,
  type Keyring,
} from '../lib/crypto'
import { createResilientNeon } from '../lib/resilient-neon'
import * as schema from '../../../drizzle/tenant/schema'

// KV is eventually consistent (~60s propagation) which is fine here: tenant
// connection info barely ever changes, and a stale cache hit just means an
// extra request or two lands on an old cache entry before the TTL clears it.
// After an emergency key rotation (tenant passwords reset) a stale entry is
// handled by the retry in createResilientNeon, see below.
const CACHE_TTL_SECONDS = 300

type LoadResult =
  | { kind: 'ok'; connectionString: string }
  | { kind: 'no_tenant' }
  | { kind: 'inactive'; status: string }

// Reads the tenant's row from the catalog and decrypts its connection string.
// Never touches the KV cache. Throws ConnectionStringDecryptError.
async function loadFromCatalog(env: Env, keyring: Keyring, orgId: string): Promise<LoadResult> {
  const catalogDb = getCatalogDb(env.CATALOG_DATABASE_URL)
  const [tenant] = await catalogDb
    .select()
    .from(tenantProjects)
    .where(eq(tenantProjects.orgId, orgId))
    .limit(1)

  if (!tenant) return { kind: 'no_tenant' }
  if (tenant.status !== 'active') return { kind: 'inactive', status: tenant.status }

  // The org id comes from the verified Clerk token (clerkAuth()), and it is
  // bound into the stored value, so a value copied into another tenant's row
  // fails to decrypt here.
  const { plaintext } = await decryptConnectionString(tenant.encryptedConnectionString, keyring, orgId)
  return { kind: 'ok', connectionString: plaintext }
}

// Runs after clerkAuth(), which guarantees c.get('orgId') is set.
export const tenantResolver = () =>
  createMiddleware<{ Bindings: Env; Variables: Variables }>(async (c, next) => {
    const orgId = c.get('orgId')
    const cacheKey = `conn:${orgId}`

    // Parsed on every request but only read and validated once per isolate
    // (parseKeyring memoizes), which is also when the key age warning is logged.
    let keyring: Keyring
    try {
      keyring = parseKeyring(c.env.TENANT_CONN_KEYRING)
    } catch (err) {
      if (!(err instanceof KeyringError)) throw err
      // The message names the problem, never key material.
      console.error(`[tenant-resolver] ${err.message}`)
      return c.json({ error: 'Server configuration error' }, 500)
    }

    let connectionString = await c.env.TENANT_CACHE.get(cacheKey)

    if (!connectionString) {
      let loaded: LoadResult
      try {
        loaded = await loadFromCatalog(c.env, keyring, orgId)
      } catch (err) {
        if (!(err instanceof ConnectionStringDecryptError)) throw err
        // Org id and key id only, never the stored value.
        console.error(`[tenant-resolver] ${err.message}`)
        return c.json({ error: 'Tenant connection is unavailable' }, 500)
      }

      if (loaded.kind === 'no_tenant') {
        return c.json({ error: 'Organization has no provisioned tenant yet' }, 404)
      }
      if (loaded.kind === 'inactive') {
        return c.json({ error: `Tenant is not active (status: ${loaded.status})` }, 409)
      }

      connectionString = loaded.connectionString

      // Don't block the response on the cache write.
      c.executionCtx.waitUntil(
        c.env.TENANT_CACHE.put(cacheKey, connectionString, { expirationTtl: CACHE_TTL_SECONDS }),
      )
    }

    // If a query is rejected for a bad database password (the tenant's
    // password was reset after this value was cached), the client calls this
    // once: drop the cached value, re-read and decrypt the catalog value, put
    // the fresh value back in the cache, and replay the query on it.
    const refresh = async (): Promise<string | null> => {
      await c.env.TENANT_CACHE.delete(cacheKey)
      const reloaded = await loadFromCatalog(c.env, keyring, orgId)
      if (reloaded.kind !== 'ok') return null
      c.executionCtx.waitUntil(
        c.env.TENANT_CACHE.put(cacheKey, reloaded.connectionString, { expirationTtl: CACHE_TTL_SECONDS }),
      )
      return reloaded.connectionString
    }

    c.set('tenantDb', drizzle(createResilientNeon(connectionString, refresh), { schema }))

    await next()
  })
