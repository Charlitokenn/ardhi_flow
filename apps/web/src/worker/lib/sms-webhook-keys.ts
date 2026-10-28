import { and, eq, isNotNull, isNull } from 'drizzle-orm'
import type { Env } from '../types'
import { getCatalogDb } from '../db/catalog'
import { tenantProjects } from '../../../drizzle/catalog/schema'
import type { WaitUntil } from './tenant-db'

// The only place outside tenant-db.ts that reads or writes the catalog, and a
// deliberate, narrow exception to "routes never touch the catalog DB": three
// operations on tenant_projects.sms_webhook_key and nothing else.
// See docs/specs/0004-sms-send-flow, Security model.

const HIT_TTL_SECONDS = 300
// Misses are cached too, so a flood of made up keys never reaches the catalog.
// (KV's minimum TTL is 60 seconds.)
const MISS_TTL_SECONDS = 60
const MISS = '-'

// Resolves the key in a webhook URL to its org id, or null for an unknown key.
export async function findOrgIdBySmsWebhookKey(env: Env, key: string, ctx?: WaitUntil): Promise<string | null> {
  const cacheKey = `smskey:${key}`
  const cached = await env.TENANT_CACHE.get(cacheKey)
  if (cached !== null) return cached === MISS ? null : cached

  const [row] = await getCatalogDb(env.CATALOG_DATABASE_URL)
    .select({ orgId: tenantProjects.orgId })
    .from(tenantProjects)
    .where(eq(tenantProjects.smsWebhookKey, key))
    .limit(1)

  const orgId = row?.orgId ?? null
  ctx?.waitUntil(
    env.TENANT_CACHE.put(cacheKey, orgId ?? MISS, { expirationTtl: orgId ? HIT_TTL_SECONDS : MISS_TTL_SECONDS }),
  )
  return orgId
}

// Stores `candidate` as the org's key only if it has none yet, then returns
// whatever key is stored. A retry after a half failed save therefore reuses
// the key already in the catalog instead of stranding a second one.
export async function setSmsWebhookKey(env: Env, orgId: string, candidate: string): Promise<string> {
  const catalogDb = getCatalogDb(env.CATALOG_DATABASE_URL)
  await catalogDb
    .update(tenantProjects)
    .set({ smsWebhookKey: candidate, updatedAt: new Date() })
    .where(and(eq(tenantProjects.orgId, orgId), isNull(tenantProjects.smsWebhookKey)))

  const [row] = await catalogDb
    .select({ smsWebhookKey: tenantProjects.smsWebhookKey })
    .from(tenantProjects)
    .where(eq(tenantProjects.orgId, orgId))
    .limit(1)

  if (!row?.smsWebhookKey) throw new Error(`No tenant row to hold an SMS webhook key for org ${orgId}`)
  return row.smsWebhookKey
}

// Active tenants that have connected NextSMS, for the delivery sweep cron.
export async function listOrgIdsWithSms(env: Env): Promise<string[]> {
  const rows = await getCatalogDb(env.CATALOG_DATABASE_URL)
    .select({ orgId: tenantProjects.orgId })
    .from(tenantProjects)
    .where(and(eq(tenantProjects.status, 'active'), isNotNull(tenantProjects.smsWebhookKey)))
  return rows.map((row) => row.orgId)
}
