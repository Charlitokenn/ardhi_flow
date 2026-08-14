#!/usr/bin/env -S npx tsx
// This is a variant of scripts/migrate-tenants.ts that connects via the
// plain Postgres wire protocol (`pg` + drizzle-orm/node-postgres) instead
// of Neon's HTTP driver (`@neondatabase/serverless` + neon-http). Use this
// if migrate-tenants.ts fails with "TypeError: fetch failed" even though
// the network otherwise has working TCP/TLS connectivity to Neon (verified
// via e.g. `curl -4 -sv https://<your-neon-host>`) — this bypasses Node's
// fetch/undici stack entirely, using raw sockets instead. See
// scripts/seed-tenant-pg.ts for the same pattern applied to seeding.
//
// Requires a .env with CATALOG_DATABASE_URL and TENANT_CONN_ENCRYPTION_KEY
// set (same values as your Worker secrets).
//
// Usage:
//   npm run migrate:tenants:pg
//   npm run migrate:tenants:pg -- --org-id=org_2abc123   # single tenant only
//   npm run migrate:tenants:pg -- --dry-run               # report only, no writes

import 'dotenv/config'
import { Command } from 'commander'
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { eq } from 'drizzle-orm'
import { applyPendingMigrationsPg, getAppliedMigrationTagsPg } from '../src/worker/lib/run-migration-pg'
import { decryptConnectionString } from '../src/worker/lib/crypto'
import { tenantProjects } from '../drizzle/catalog/schema'
import { loadTenantMigrationsFromDisk } from './lib/tenant-migration-files'

const program = new Command()
program
  .option('--org-id <orgId>', 'Only migrate this one Clerk organization ID (default: all tenants)')
  .option('--dry-run', 'Report which tenants/migrations are pending without applying anything', false)
  .parse(process.argv)

const { orgId, dryRun } = program.opts<{ orgId?: string; dryRun: boolean }>()

async function main() {
  const { CATALOG_DATABASE_URL, TENANT_CONN_ENCRYPTION_KEY } = process.env

  if (!CATALOG_DATABASE_URL || !TENANT_CONN_ENCRYPTION_KEY) {
    throw new Error('Missing required env vars: CATALOG_DATABASE_URL, TENANT_CONN_ENCRYPTION_KEY')
  }

  const migrations = loadTenantMigrationsFromDisk()
  console.log(
    `→ ${migrations.length} known tenant migration(s): ${migrations.map((m: { tag: string }) => m.tag).join(', ')}`,
  )

  const catalogPool = new Pool({ connectionString: CATALOG_DATABASE_URL })
  const catalogDb = drizzle(catalogPool)
  const tenants = orgId
    ? await catalogDb.select().from(tenantProjects).where(eq(tenantProjects.orgId, orgId))
    : await catalogDb.select().from(tenantProjects).where(eq(tenantProjects.status, 'active'))

  if (tenants.length === 0) {
    console.log('No matching tenants found.')
    await catalogPool.end()
    return
  }

  console.log(`→ Found ${tenants.length} tenant(s) to check.\n`)

  let migratedCount = 0
  let failedCount = 0

  for (const tenant of tenants) {
    const label = `${tenant.orgId} (${tenant.neonProjectName})`
    try {
      const connectionUri = await decryptConnectionString(
        tenant.encryptedConnectionString,
        TENANT_CONN_ENCRYPTION_KEY,
      )

      if (dryRun) {
        const applied = await getAppliedMigrationTagsPg(connectionUri)
        const pending = migrations
          .filter((m: { tag: string }) => !applied.has(m.tag))
          .map((m: { tag: string }) => m.tag)
        console.log(
          pending.length > 0
            ? `  ${label}: ${pending.length} pending (${pending.join(', ')})`
            : `  ${label}: up to date`,
        )
        continue
      }

      const applied = await applyPendingMigrationsPg(connectionUri, migrations)

      if (applied.length > 0) {
        await catalogDb
          .update(tenantProjects)
          .set({ schemaVersion: migrations.length, updatedAt: new Date() })
          .where(eq(tenantProjects.orgId, tenant.orgId))

        console.log(`  ✓ ${label}: applied ${applied.join(', ')}`)
        migratedCount++
      } else {
        console.log(`  · ${label}: already up to date`)
      }
    } catch (err) {
      failedCount++
      console.error(`  ✗ ${label}: FAILED — ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  console.log(
    `\n${dryRun ? 'Dry run complete.' : 'Done.'} ${migratedCount} tenant(s) migrated, ${failedCount} failed, ${
      tenants.length - migratedCount - failedCount
    } already up to date.`,
  )

  await catalogPool.end()

  if (failedCount > 0) {
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error('❌ Migration fan-out failed:', err)
  process.exit(1)
})
