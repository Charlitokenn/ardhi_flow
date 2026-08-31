// Shared by the CLI scripts (scripts/provision-tenant.ts,
// scripts/migrate-tenants.ts) that need the full list of tenant migration
// SQL files. Unlike the Worker (src/worker/lib/tenant-migrations.ts, which
// has to bundle each file explicitly via `?raw` since Workers can't read the
// filesystem), a local Node script can just read drizzle/tenant/migrations
// off disk directly, driven by drizzle-kit's own journal — so new migration
// files are picked up automatically without editing this file.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TenantMigrationFile } from '../../src/worker/lib/run-migration'

const MIGRATIONS_DIR = join(process.cwd(), 'drizzle/tenant/migrations')

interface JournalEntry {
  tag: string
}

interface Journal {
  entries: JournalEntry[]
}

export function loadTenantMigrationsFromDisk(): TenantMigrationFile[] {
  const journalPath = join(MIGRATIONS_DIR, 'meta', '_journal.json')
  const journal = JSON.parse(readFileSync(journalPath, 'utf-8')) as Journal

  return journal.entries.map(({ tag }) => ({
    tag,
    sql: readFileSync(join(MIGRATIONS_DIR, `${tag}.sql`), 'utf-8'),
  }))
}
