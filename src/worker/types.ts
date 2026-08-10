import type { NeonHttpDatabase } from 'drizzle-orm/neon-http'
import type { ProvisionTenantMessage } from './queue/provision-tenant'

export interface Env {
  // Static assets (the built React app) — configured in wrangler.jsonc.
  ASSETS: Fetcher

  // Tenant connection-info cache, keyed by Clerk org_id.
  TENANT_CACHE: KVNamespace

  // Per-tenant file storage.
  TENANT_FILES: R2Bucket

  // Async provisioning queue — the Clerk webhook producer side.
  TENANT_PROVISION_QUEUE: Queue<ProvisionTenantMessage>

  // Non-secret vars (wrangler.jsonc `vars`).
  DEFAULT_TENANT_REGION: string

  // Secrets — set via `wrangler secret put <NAME>` / .dev.vars locally.
  CATALOG_DATABASE_URL: string
  CLERK_SECRET_KEY: string
  CLERK_JWT_KEY: string
  CLERK_WEBHOOK_SECRET: string
  NEON_API_KEY: string
  TENANT_CONN_ENCRYPTION_KEY: string
}

export interface Variables {
  userId: string
  orgId: string
  orgRole: string
  // Populated by the tenant-resolver middleware once orgId is known.
  tenantDb: NeonHttpDatabase
}
