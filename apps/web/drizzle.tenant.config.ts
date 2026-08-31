import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

// This config exists to run `drizzle-kit generate` and produce SQL migration
// files under drizzle/tenant/migrations. There is no single "the" tenant
// database to point drizzle-kit push/migrate at — every tenant has its own
// Neon project — so those commands aren't used against this config. The
// generated SQL is applied per-tenant by the provisioning queue consumer
// (new tenants) and the migration fan-out job (schema changes to existing
// tenants). dbCredentials is only required by drizzle-kit's schema, so it
// points at any reachable Postgres URL for local introspection — it's not
// actually written to.
export default defineConfig({
  schema: './drizzle/tenant/schema.ts',
  out: './drizzle/tenant/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.CATALOG_DATABASE_URL ?? 'postgresql://placeholder/placeholder',
  },
})
