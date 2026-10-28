import type { NeonHttpDatabase } from 'drizzle-orm/neon-http'
import type { ProvisionTenantMessage } from './queue/provision-tenant'
import type { SmsSendMessage } from './queue/send-sms'
import type { SmsSweepMessage } from './queue/sms-sweep'
import type { TenantPresence } from './durable-objects/tenant-presence'
import * as schema from '../../drizzle/tenant/schema'
import type { Keyring } from './lib/crypto'

export interface Env {
  // Static assets (the built React app) — configured in wrangler.jsonc.
  ASSETS: Fetcher

  // Tenant connection-info cache, keyed by Clerk org_id.
  TENANT_CACHE: KVNamespace

  // Per-tenant file storage.
  TENANT_FILES: R2Bucket

  // Async provisioning queue — the Clerk webhook producer side.
  TENANT_PROVISION_QUEUE: Queue<ProvisionTenantMessage>

  // SMS campaign chunks waiting to be handed to NextSMS (queue/send-sms.ts).
  SMS_SEND_QUEUE: Queue<SmsSendMessage>
  // One delivery sweep per tenant, enqueued by the 30 minute cron (queue/sms-sweep.ts).
  SMS_SWEEP_QUEUE: Queue<SmsSweepMessage>

  // Presence Durable Object — one instance per tenant org, name = org id.
  // Binding name (env key) is separate from the class name below — set to
  // TENANT_PRESENCE to match this file's existing UPPER_SNAKE_CASE binding
  // style. partyserver derives the client-facing party name by kebab-casing
  // whichever binding name is used; "TENANT_PRESENCE" -> "tenant-presence",
  // same result as "TenantPresence" would give, so this is a style choice,
  // not a functional one — just keep it consistent with wrangler.jsonc.
  TENANT_PRESENCE: DurableObjectNamespace<TenantPresence>

  // Non-secret vars (wrangler.jsonc `vars`).
  DEFAULT_TENANT_REGION: string
  // NextSMS API base URL (https://messaging-service.co.tz). A var, not a
  // constant, so local development can point at a mock.
  NEXTSMS_BASE_URL: string

  // Secrets — set via `wrangler secret put <NAME>` / .dev.vars locally.
  CATALOG_DATABASE_URL: string
  CLERK_SECRET_KEY: string
  CLERK_JWT_KEY: string
  CLERK_WEBHOOK_SECRET: string
  NEON_API_KEY: string
  // JSON keyring: { current, keys: { <keyId>: { key, createdAt } } }. See
  // src/worker/lib/crypto.ts. Replaces the single key secret used before rotation.
  TENANT_CONN_KEYRING: string
}

export interface Variables {
  userId: string
  orgId: string
  orgRole: string
  // Populated by the tenant-resolver middleware once orgId is known.
  tenantDb: NeonHttpDatabase<typeof schema>
  // The parsed TENANT_CONN_KEYRING, for routes that encrypt or decrypt tenant
  // secrets (sms-settings.ts). Set by the tenant-resolver middleware.
  keyring: Keyring
}
