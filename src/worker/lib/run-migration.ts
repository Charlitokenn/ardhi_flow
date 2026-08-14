import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { sql } from 'drizzle-orm'

// drizzle-kit separates statements in generated .sql files with this exact
// marker (verified against actual drizzle-kit output — see
// drizzle/tenant/migrations/0000_init.sql).
const STATEMENT_BREAKPOINT = '--> statement-breakpoint'

// Tracks which drizzle-kit migration tags (e.g. "0000_init") have already
// been applied to a given tenant database. Tenant DBs are never touched by
// `drizzle-kit migrate` directly (see drizzle.tenant.config.ts), so we can't
// rely on drizzle-kit's own `__drizzle_migrations` bookkeeping — this is our
// own minimal equivalent of it, applied per-tenant.
const MIGRATIONS_TABLE = '_tenant_migrations'

export interface TenantMigrationFile {
  tag: string
  sql: string
}

function splitStatements(migrationSql: string): string[] {
  return migrationSql
    .split(STATEMENT_BREAKPOINT)
    .map((s) => s.trim())
    .filter(Boolean)
}

export async function applyMigrationSql(connectionUri: string, migrationSql: string): Promise<void> {
  const db = drizzle(neon(connectionUri))
  const statements = splitStatements(migrationSql)
  if (statements.length === 0) return
  // Applied as a single atomic batch (neon-http's transaction() endpoint) so a
  // network hiccup mid-migration can't leave DDL half-applied — see
  // applyPendingMigrations for why this matters (non-idempotent statements
  // like CREATE TYPE would otherwise fail permanently on retry).
  await db.batch(
    statements.map((statement) => db.execute(sql.raw(statement))) as unknown as [
      ReturnType<typeof db.execute>,
      ...ReturnType<typeof db.execute>[],
    ],
  )
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
export async function getAppliedMigrationTags(connectionUri: string): Promise<Set<string>> {
  const db = drizzle(neon(connectionUri))
  await ensureMigrationsTable(db)
  const rows = await db.execute<{ tag: string }>(sql.raw(`select "tag" from "${MIGRATIONS_TABLE}"`))
  return new Set(rows.rows.map((r) => r.tag))
}

/**
 * Applies every migration file not yet recorded as applied, in order, to
 * the given tenant database, recording each one as applied as it succeeds.
 * Returns the tags that were newly applied (empty if the tenant was already
 * fully up to date).
 */
export async function applyPendingMigrations(
  connectionUri: string,
  migrations: TenantMigrationFile[],
): Promise<string[]> {
  const db = drizzle(neon(connectionUri))
  await ensureMigrationsTable(db)

  const appliedRows = await db.execute<{ tag: string }>(sql.raw(`select "tag" from "${MIGRATIONS_TABLE}"`))
  const applied = new Set(appliedRows.rows.map((r) => r.tag))

  const newlyApplied: string[] = []
  for (const migration of migrations) {
    if (applied.has(migration.tag)) continue

    // All of a migration's statements plus the tag-insert are sent as one
    // atomic batch (neon-http's transaction() endpoint): if any statement
    // fails (including a network drop), nothing from this migration is
    // committed and the tag isn't recorded, so a retry safely re-attempts
    // the whole migration instead of failing on already-applied DDL.
    const statements = [
      ...splitStatements(migration.sql).map((statement) => db.execute(sql.raw(statement))),
      db.execute(sql`insert into ${sql.raw(`"${MIGRATIONS_TABLE}"`)} ("tag") values (${migration.tag})`),
    ] as unknown as [ReturnType<typeof db.execute>, ...ReturnType<typeof db.execute>[]]

    await db.batch(statements)
    newlyApplied.push(migration.tag)
  }

  return newlyApplied
}
