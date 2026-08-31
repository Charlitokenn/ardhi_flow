import type { TenantMigrationFile } from './run-migration'

// Bundled at build time — Cloudflare Workers can't read the filesystem at
// runtime, so unlike scripts/migrate-tenants.ts (which reads
// drizzle/tenant/migrations/*.sql off disk directly), the Worker needs its
// migration files bundled in at build time.
//
// This uses Vite's import.meta.glob to automatically pick up every
// drizzle/tenant/migrations/NNNN_*.sql file at build time — no manual list
// to maintain. Running `npm run db:generate:tenant` and committing the
// resulting file is enough; it's included here automatically the next time
// the Worker is built/deployed.
const modules = import.meta.glob<string>('../../../drizzle/tenant/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
})

export const TENANT_MIGRATIONS: TenantMigrationFile[] = Object.entries(modules)
  .map(([path, sql]) => ({
    tag: path.split('/').pop()!.replace(/\.sql$/, ''),
    sql,
  }))
  // File names are zero-padded (0000_init, 0001_init, ...), so a plain
  // lexicographic sort keeps them in the order drizzle-kit generated them.
  .sort((a, b) => a.tag.localeCompare(b.tag))
