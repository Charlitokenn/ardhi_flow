import type { Env } from '../types'
import { createNeonProject, findProjectByName } from '../lib/neon-api'
import { applyPendingMigrations } from '../lib/run-migration'
import { encryptConnectionString } from '../lib/crypto'
import { getCatalogDb } from '../db/catalog'
import { tenantProjects, orgs, provisioningEvents } from '../../../drizzle/catalog/schema'
import { TENANT_MIGRATIONS } from '../lib/tenant-migrations'

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

      // Applies every known tenant migration (not just the initial one) so a
      // freshly created project ends up on the same schema version as
      // already-provisioned tenants. Later schema changes to already
      // provisioned tenants go through the same helper — see
      // scripts/migrate-tenants.ts for the fan-out job that runs it against
      // every tenant in the catalog.
      await applyPendingMigrations(connectionUri, TENANT_MIGRATIONS)

      const encrypted = await encryptConnectionString(connectionUri, env.TENANT_CONN_ENCRYPTION_KEY)

      await catalogDb
        .insert(tenantProjects)
        .values({
          orgId: clerkOrgId,
          neonProjectId: projectId,
          neonProjectName: projectName,
          region: env.DEFAULT_TENANT_REGION,
          encryptedConnectionString: encrypted,
          schemaVersion: TENANT_MIGRATIONS.length,
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
