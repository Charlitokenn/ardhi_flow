#!/usr/bin/env -S npx tsx
// Pushes pending schema migrations to every provisioned tenant database.
//
// This is the "migration fan-out job" referenced (but not implemented) in
// src/worker/queue/provision-tenant.ts and drizzle.tenant.config.ts: since
// there's no single tenant DB, `drizzle-kit migrate`/`push` can't be pointed
// at "the" tenant database — instead this script iterates every row in the
// catalog's `tenant_projects` table, decrypts each tenant's connection
// string, and applies any migration (from drizzle/tenant/migrations/) that
// hasn't been recorded as applied yet for that specific tenant.
//
// Requires a .env with CATALOG_DATABASE_URL and TENANT_CONN_ENCRYPTION_KEY
// set (same values as your Worker secrets).
//
// If this fails with "TypeError: fetch failed" even though the network
// otherwise has working TCP/TLS connectivity to Neon (verified via e.g.
// `curl -4 -sv https://<your-neon-host>`), use `npm run migrate:tenants:pg`
// instead — see scripts/migrate-tenants-pg.ts.
//
// Usage:
//   npm run migrate:tenants
//   npm run migrate:tenants -- --org-id=org_2abc123   # single tenant only
//   npm run migrate:tenants -- --dry-run               # report only, no writes

import "dotenv/config";
import dns from 'node:dns'
import { Command } from 'commander'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { eq } from 'drizzle-orm'
import { applyPendingMigrations, getAppliedMigrationTags } from '../src/worker/lib/run-migration'
import { decryptConnectionString } from '../src/worker/lib/crypto'
import { tenantProjects } from '../drizzle/catalog/schema'
import { loadTenantMigrationsFromDisk } from './lib/tenant-migration-files'
import { isFetchNetworkError, printFetchNetworkErrorHint } from './lib/network-error-hint'

// See scripts/seed-tenant.ts for why this is needed: Node's fetch prefers
// IPv6, which breaks Neon connectivity on networks where IPv6 doesn't
// actually route.
dns.setDefaultResultOrder('ipv4first')

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

  const catalogDb = drizzle(neon(CATALOG_DATABASE_URL))
  const tenants = orgId
    ? await catalogDb.select().from(tenantProjects).where(eq(tenantProjects.orgId, orgId))
    : await catalogDb.select().from(tenantProjects).where(eq(tenantProjects.status, 'active'))

  if (tenants.length === 0) {
    console.log('No matching tenants found.')
    return
  }

  console.log(`→ Found ${tenants.length} tenant(s) to check.\n`)

  let migratedCount = 0
  let failedCount = 0
  let hintPrinted = false

  for (const tenant of tenants) {
    const label = `${tenant.orgId} (${tenant.neonProjectName})`
    try {
      const connectionUri = await decryptConnectionString(
        tenant.encryptedConnectionString,
        TENANT_CONN_ENCRYPTION_KEY,
      )

      if (dryRun) {
        const applied = await getAppliedMigrationTags(connectionUri)
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

      const applied = await applyPendingMigrations(connectionUri, migrations)

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
      if (!hintPrinted && isFetchNetworkError(err)) {
        hintPrinted = true
        printFetchNetworkErrorHint('migrate:tenants:pg')
      }
    }
  }

  console.log(
    `\n${dryRun ? 'Dry run complete.' : 'Done.'} ${migratedCount} tenant(s) migrated, ${failedCount} failed, ${
      tenants.length - migratedCount - failedCount
    } already up to date.`,
  )

  if (failedCount > 0) {
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error('❌ Migration fan-out failed:', err)
  if (isFetchNetworkError(err)) {
    printFetchNetworkErrorHint('migrate:tenants:pg')
  }
  process.exit(1)
})
