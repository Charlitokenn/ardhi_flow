import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { sql } from 'drizzle-orm'
import type { TenantMigrationFile } from './run-migration'

// This is a variant of run-migration.ts that connects via the plain
// Postgres wire protocol (`pg` + drizzle-orm/node-postgres) instead of
// Neon's HTTP driver (`@neondatabase/serverless` + neon-http). Use this if
// migrate-tenants.ts fails with "TypeError: fetch failed" even though the
// network otherwise has working TCP/TLS connectivity to Neon (verified via
// e.g. `curl -4 -sv https://<your-neon-host>`) — this bypasses Node's
// fetch/undici stack entirely, using raw sockets instead. See
// scripts/seed-tenant-pg.ts for the same pattern applied to seeding.

const STATEMENT_BREAKPOINT = '--> statement-breakpoint'
const MIGRATIONS_TABLE = '_tenant_migrations'

function splitStatements(migrationSql: string): string[] {
  return migrationSql
    .split(STATEMENT_BREAKPOINT)
    .map((s) => s.trim())
    .filter(Boolean)
}

async function ensureMigrationsTable(db: ReturnType<typeof drizzle>): Promise<void> {
  await db.execute(
    sql.raw(
      `create table if not exists "${MIGRATIONS_TABLE}" ("tag" text primary key, "applied_at" timestamp with time zone not null default now())`,
    ),
  )
}

/**
 * Returns the set of migration tags already recorded as applied against
 * this tenant database (creating the tracking table first if it doesn't
 * exist yet — e.g. for tenants provisioned before this tracking existed).
 */
export async function getAppliedMigrationTagsPg(connectionUri: string): Promise<Set<string>> {
  const pool = new Pool({ connectionString: connectionUri })
  try {
    const db = drizzle(pool)
    await ensureMigrationsTable(db)
    const rows = await db.execute<{ tag: string }>(sql.raw(`select "tag" from "${MIGRATIONS_TABLE}"`))
    return new Set(rows.rows.map((r) => r.tag))
  } finally {
    await pool.end()
  }
}

/**
 * Applies every migration file not yet recorded as applied, in order, to
 * the given tenant database, recording each one as applied as it succeeds.
 * Returns the tags that were newly applied (empty if the tenant was already
 * fully up to date). Each migration is applied inside a real Postgres
 * transaction (the node-postgres equivalent of neon-http's `db.batch()`).
 */
export async function applyPendingMigrationsPg(
  connectionUri: string,
  migrations: TenantMigrationFile[],
): Promise<string[]> {
  const pool = new Pool({ connectionString: connectionUri })
  try {
    const db = drizzle(pool)
    await ensureMigrationsTable(db)

    const appliedRows = await db.execute<{ tag: string }>(sql.raw(`select "tag" from "${MIGRATIONS_TABLE}"`))
    const applied = new Set(appliedRows.rows.map((r) => r.tag))

    const newlyApplied: string[] = []
    for (const migration of migrations) {
      if (applied.has(migration.tag)) continue

      // All of a migration's statements plus the tag-insert are applied in
      // one real transaction: if any statement fails, nothing from this
      // migration is committed and the tag isn't recorded, so a retry
      // safely re-attempts the whole migration instead of failing on
      // already-applied DDL.
      await db.transaction(async (tx) => {
        for (const statement of splitStatements(migration.sql)) {
          await tx.execute(sql.raw(statement))
        }
        await tx.execute(sql`insert into ${sql.raw(`"${MIGRATIONS_TABLE}"`)} ("tag") values (${migration.tag})`)
      })

      newlyApplied.push(migration.tag)
    }

    return newlyApplied
  } finally {
    await pool.end()
  }
}
