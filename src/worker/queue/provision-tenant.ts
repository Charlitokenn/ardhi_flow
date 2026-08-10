import type { Env } from '../types'
import { createNeonProject, findProjectByName } from '../lib/neon-api'
import { applyMigrationSql } from '../lib/run-migration'
import { encryptConnectionString } from '../lib/crypto'
import { getCatalogDb } from '../db/catalog'
import { tenantProjects, orgs, provisioningEvents } from '../../../drizzle/catalog/schema'

// Bundled at build time — see src/worker/raw-sql.d.ts for the `?raw` type.
// Only covers the *initial* schema for brand-new tenants; schema changes to
// already-provisioned tenants go through a separate migration fan-out job
// (not included in this scaffold — see chat notes on the pattern).
import initMigrationSql from '../../../drizzle/tenant/migrations/0000_init.sql?raw'

export interface ProvisionTenantMessage {
  clerkOrgId: string
  orgName: string
}

export async function handleTenantProvisionQueue(
  batch: MessageBatch<ProvisionTenantMessage>,
  env: Env,
): Promise<void> {
  const catalogDb = getCatalogDb(env.CATALOG_DATABASE_URL)

  for (const message of batch.messages) {
    const { clerkOrgId, orgName } = message.body

    try {
      await logEvent(catalogDb, clerkOrgId, 'provisioning_started')

      const projectName = `tenant-${clerkOrgId}`

      // Guards against Cloudflare Queues redelivering this message after a
      // prior attempt got as far as creating the Neon project but failed
      // before the catalog write (project creation is a POST — Neon's docs
      // explicitly flag POST as unsafe to blindly retry). Rather than guess
      // at connection details for a project we didn't just create, surface
      // it as a distinct state for a human to reconcile — see
      // scripts/provision-tenant.ts for a way to pick it back up manually.
      const existing = await findProjectByName(env.NEON_API_KEY, projectName)
      if (existing) {
        await logEvent(
          catalogDb,
          clerkOrgId,
          'provisioning_conflict',
          `Neon project ${existing.id} named "${projectName}" already exists but has no active catalog row — needs manual reconciliation, not re-provisioning.`,
        )
        message.ack()
        continue
      }

      const { projectId, connectionUri } = await createNeonProject(
        env.NEON_API_KEY,
        projectName,
        env.DEFAULT_TENANT_REGION,
      )

      await applyMigrationSql(connectionUri, initMigrationSql)

      const encrypted = await encryptConnectionString(connectionUri, env.TENANT_CONN_ENCRYPTION_KEY)

      await catalogDb
        .insert(tenantProjects)
        .values({
          orgId: clerkOrgId,
          neonProjectId: projectId,
          neonProjectName: projectName,
          region: env.DEFAULT_TENANT_REGION,
          encryptedConnectionString: encrypted,
          schemaVersion: 1,
          status: 'active',
          r2Prefix: `tenants/${clerkOrgId}/`,
        })
        .onConflictDoUpdate({
          target: tenantProjects.orgId,
          set: { status: 'active', encryptedConnectionString: encrypted, updatedAt: new Date() },
        })

      await catalogDb.insert(orgs).values({ clerkOrgId, name: orgName }).onConflictDoNothing()

      await logEvent(catalogDb, clerkOrgId, 'provisioning_completed')
      message.ack()
    } catch (err) {
      await logEvent(catalogDb, clerkOrgId, 'provisioning_failed', String(err))
      // Let the queue's configured retry/DLQ policy (wrangler.jsonc) handle
      // this instead of swallowing it — a half-created Neon project on a
      // permanent failure needs a human, not a silent ack.
      message.retry()
    }
  }
}

async function logEvent(
  catalogDb: ReturnType<typeof getCatalogDb>,
  orgId: string,
  event: string,
  detail?: string,
) {
  // Best-effort — a logging failure shouldn't mask the original error.
  try {
    await catalogDb.insert(provisioningEvents).values({ orgId, event, detail })
  } catch {
    /* noop */
  }
}
