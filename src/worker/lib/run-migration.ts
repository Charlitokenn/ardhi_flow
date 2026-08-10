import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { sql } from 'drizzle-orm'

// drizzle-kit separates statements in generated .sql files with this exact
// marker (verified against actual drizzle-kit output — see
// drizzle/tenant/migrations/0000_init.sql).
const STATEMENT_BREAKPOINT = '--> statement-breakpoint'

export async function applyMigrationSql(connectionUri: string, migrationSql: string): Promise<void> {
  const db = drizzle(neon(connectionUri))
  const statements = migrationSql
    .split(STATEMENT_BREAKPOINT)
    .map((s) => s.trim())
    .filter(Boolean)

  for (const statement of statements) {
    await db.execute(sql.raw(statement))
  }
}
