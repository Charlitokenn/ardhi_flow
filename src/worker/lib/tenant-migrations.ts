import type { TenantMigrationFile } from './run-migration'

// Bundled at build time — see src/worker/raw-sql.d.ts for the `?raw` type.
// Cloudflare Workers can't read the filesystem at runtime, so unlike
// scripts/migrate-tenants.ts (which reads drizzle/tenant/migrations/*.sql
// off disk), the Worker needs every migration file listed here explicitly.
//
// IMPORTANT: when you run `npm run db:generate:tenant` and it produces a new
// SQL file, add it here too (in order) — otherwise brand-new tenants
// provisioned through the Cloudflare Queue consumer (handleTenantProvisionQueue)
// will silently miss that migration.
import init from '../../../drizzle/tenant/migrations/0000_init.sql?raw'
import init1 from '../../../drizzle/tenant/migrations/0001_init.sql?raw'

export const TENANT_MIGRATIONS: TenantMigrationFile[] = [
  { tag: '0000_init', sql: init },
  { tag: '0001_init', sql: init1 },
]
