import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http'
import { eq } from 'drizzle-orm'
import type { Env } from '../types'
import { getCatalogDb } from '../db/catalog'
import { tenantProjects } from '../../../drizzle/catalog/schema'
import { ConnectionStringDecryptError, decryptConnectionString, parseKeyring, type Keyring } from './crypto'
import { createResilientNeon } from './resilient-neon'
import * as schema from '../../../drizzle/tenant/schema'

export type TenantDb = NeonHttpDatabase<typeof schema>

// All the helpers need from an execution context. Hono's and the Workers
// runtime's ExecutionContext types differ, and both satisfy this.
export type WaitUntil = { waitUntil(promise: Promise<unknown>): void }

// KV is eventually consistent (~60s propagation) which is fine here: tenant
// connection info barely ever changes, and a stale cache hit just means an
// extra request or two lands on an old cache entry before the TTL clears it.
// After an emergency key rotation (tenant passwords reset) a stale entry is
// handled by the retry in createResilientNeon, see below.
const CACHE_TTL_SECONDS = 300

export type TenantDbResult =
  | { ok: true; db: TenantDb; keyring: Keyring }
  | { ok: false; reason: 'no_tenant' }
  | { ok: false; reason: 'inactive'; status: string }
  | { ok: false; reason: 'decrypt_failed' }

type LoadResult =
  | { kind: 'ok'; connectionString: string }
  | { kind: 'no_tenant' }
  | { kind: 'inactive'; status: string }

// Reads the tenant's row from the catalog and decrypts its connection string.
// Never touches the KV cache. Throws ConnectionStringDecryptError.
async function loadFromCatalog(env: Env, keyring: Keyring, orgId: string): Promise<LoadResult> {
  const catalogDb = getCatalogDb(env.CATALOG_DATABASE_URL)
  const [tenant] = await catalogDb
    .select({
      status: tenantProjects.status,
      encryptedConnectionString: tenantProjects.encryptedConnectionString,
    })
    .from(tenantProjects)
    .where(eq(tenantProjects.orgId, orgId))
    .limit(1)

  if (!tenant) return { kind: 'no_tenant' }
  if (tenant.status !== 'active') return { kind: 'inactive', status: tenant.status }

  // The org id is bound into the stored value, so a value copied into another
  // tenant's row fails to decrypt here.
  const { plaintext } = await decryptConnectionString(tenant.encryptedConnectionString, keyring, orgId)
  return { kind: 'ok', connectionString: plaintext }
}

// The one way to open a tenant's database, shared by tenantResolver() (orgId
// from the verified Clerk token) and the NextSMS webhook, queue consumers and
// cron (orgId from a catalog lookup or a queue message we wrote). See
// docs/specs/0004-sms-send-flow, Security model.
//
// `ctx` is only used for the non blocking KV cache write; without one the
// cache write is skipped. Throws KeyringError when TENANT_CONN_KEYRING is
// unusable, so the caller can report a configuration error.
export async function getTenantDbForOrg(env: Env, orgId: string, ctx?: WaitUntil): Promise<TenantDbResult> {
  // Parsed on every call but only read and validated once per isolate
  // (parseKeyring memoizes), which is also when the key age warning is logged.
  const keyring = parseKeyring(env.TENANT_CONN_KEYRING)
  const cacheKey = `conn:${orgId}`

  const cachePut = (value: string) => {
    ctx?.waitUntil(env.TENANT_CACHE.put(cacheKey, value, { expirationTtl: CACHE_TTL_SECONDS }))
  }

  let connectionString = await env.TENANT_CACHE.get(cacheKey)

  if (!connectionString) {
    let loaded: LoadResult
    try {
      loaded = await loadFromCatalog(env, keyring, orgId)
    } catch (err) {
      if (!(err instanceof ConnectionStringDecryptError)) throw err
      // Org id and key id only, never the stored value.
      console.error(`[tenant-db] ${err.message}`)
      return { ok: false, reason: 'decrypt_failed' }
    }

    if (loaded.kind === 'no_tenant') return { ok: false, reason: 'no_tenant' }
    if (loaded.kind === 'inactive') return { ok: false, reason: 'inactive', status: loaded.status }

    connectionString = loaded.connectionString
    cachePut(connectionString)
  }

  // If a query is rejected for a bad database password (the tenant's
  // password was reset after this value was cached), the client calls this
  // once: drop the cached value, re-read and decrypt the catalog value, put
  // the fresh value back in the cache, and replay the query on it.
  const refresh = async (): Promise<string | null> => {
    await env.TENANT_CACHE.delete(cacheKey)
    const reloaded = await loadFromCatalog(env, keyring, orgId)
    if (reloaded.kind !== 'ok') return null
    cachePut(reloaded.connectionString)
    return reloaded.connectionString
  }

  return { ok: true, db: drizzle(createResilientNeon(connectionString, refresh), { schema }), keyring }
}
