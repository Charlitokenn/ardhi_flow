#!/usr/bin/env -S npx tsx
// Manually provision a tenant Neon project, bypassing the Clerk webhook.
// Useful for backfilling existing orgs or testing the pipeline end-to-end
// without needing a live webhook call.
//
// Requires a .env with CATALOG_DATABASE_URL, NEON_API_KEY, and
// TENANT_CONN_ENCRYPTION_KEY set (same values as your Worker secrets).
//
// Usage:
//   npm run provision:tenant -- --org-id=org_2abc123 --name="Acme Plots"

import 'dotenv/config'
import { Command } from 'commander'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { createNeonProject, findProjectByName } from '../src/worker/lib/neon-api'
import { applyPendingMigrations } from '../src/worker/lib/run-migration'
import { encryptConnectionString } from '../src/worker/lib/crypto'
import { tenantProjects, orgs, provisioningEvents } from '../drizzle/catalog/schema'
import { loadTenantMigrationsFromDisk } from './lib/tenant-migration-files'

const program = new Command()
program
  .requiredOption('--org-id <orgId>', 'Clerk organization ID')
  .requiredOption('--name <name>', 'Organization display name')
  .option('--region <region>', 'Neon region', 'aws-eu-central-1')
  .parse(process.argv)

const { orgId, name, region } = program.opts<{ orgId: string; name: string; region: string }>()

async function main() {
  const { CATALOG_DATABASE_URL, NEON_API_KEY, TENANT_CONN_ENCRYPTION_KEY } = process.env

  if (!CATALOG_DATABASE_URL || !NEON_API_KEY || !TENANT_CONN_ENCRYPTION_KEY) {
    throw new Error(
      'Missing required env vars: CATALOG_DATABASE_URL, NEON_API_KEY, TENANT_CONN_ENCRYPTION_KEY',
    )
  }

  const catalogDb = drizzle(neon(CATALOG_DATABASE_URL))
  const projectName = `tenant-${orgId}`

  const existing = await findProjectByName(NEON_API_KEY, projectName)
  if (existing) {
    throw new Error(
      `Neon project ${existing.id} named "${projectName}" already exists. ` +
        `Refusing to create a duplicate — if this is a genuine retry after a partial ` +
        `failure, reconcile manually via the Neon console rather than re-running this script.`,
    )
  }

  console.log(`→ Creating Neon project for org ${orgId} in ${region}...`)
  const { projectId, connectionUri } = await createNeonProject(NEON_API_KEY, projectName, region)
  console.log(`  ✓ Project ${projectId} created`)

  const migrations = loadTenantMigrationsFromDisk()

  console.log(`→ Applying ${migrations.length} migration(s)...`)
  const applied = await applyPendingMigrations(connectionUri, migrations)
  console.log(`  ✓ Schema applied (${applied.join(', ')})`)

  const encrypted = await encryptConnectionString(connectionUri, TENANT_CONN_ENCRYPTION_KEY)

  await catalogDb
    .insert(tenantProjects)
    .values({
      orgId,
      neonProjectId: projectId,
      neonProjectName: projectName,
      region,
      encryptedConnectionString: encrypted,
      schemaVersion: migrations.length,
      status: 'active',
      r2Prefix: `tenants/${orgId}/`,
    })
    .onConflictDoUpdate({
      target: tenantProjects.orgId,
      set: { status: 'active', encryptedConnectionString: encrypted, updatedAt: new Date() },
    })

  await catalogDb.insert(orgs).values({ clerkOrgId: orgId, name }).onConflictDoNothing()
  await catalogDb.insert(provisioningEvents).values({ orgId, event: 'provisioned_manually' })

  console.log(`✅ Tenant ${orgId} provisioned and active.`)
}

main().catch((err) => {
  console.error('❌ Provisioning failed:', err)
  process.exit(1)
})
