import { pgTable, text, timestamp, uuid, pgEnum, integer } from 'drizzle-orm/pg-core'

// Lives in a single dedicated Neon project — the "control plane" — separate
// from every tenant project it tracks. See chat notes: this is the thing
// every request consults before it knows which tenant it's talking to, so
// keep it warm and treat it as a cache of the Neon API's own state, not the
// sole source of truth (project names are predictable: `tenant-{orgId}`).

export const provisioningStatus = pgEnum('provisioning_status', [
  'pending', // queued, not yet picked up by the consumer
  'provisioning', // Neon project creation / migration in progress
  'active', // ready to serve traffic
  'failed', // provisioning errored — see provisioning_events for detail
  'suspended', // deliberately deactivated (e.g. non-payment)
])

export const orgs = pgTable('orgs', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkOrgId: text('clerk_org_id').notNull().unique(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const tenantProjects = pgTable('tenant_projects', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Clerk org_id — this is what the JWT claim gives us on every request, so
  // it's the lookup key, not orgs.id.
  orgId: text('org_id').notNull().unique(),

  neonProjectId: text('neon_project_id').notNull().unique(),
  neonProjectName: text('neon_project_name').notNull(), // `tenant-{orgId}`, kept human-searchable
  region: text('region').notNull().default('aws-eu-central-1'),

  // AES-GCM encrypted with TENANT_CONN_ENCRYPTION_KEY — never store plaintext.
  encryptedConnectionString: text('encrypted_connection_string').notNull(),

  // Bumped by the migration fan-out job; lets you tell which tenants are
  // still on an older schema version mid-rollout.
  schemaVersion: integer('schema_version').notNull().default(0),

  status: provisioningStatus('status').notNull().default('pending'),

  // R2 key prefix for this tenant's files, e.g. `tenants/{orgId}/`.
  r2Prefix: text('r2_prefix').notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const provisioningEvents = pgTable('provisioning_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').notNull(),
  event: text('event').notNull(), // e.g. 'queued' | 'provisioning_started' | 'provisioning_completed' | 'provisioning_failed'
  detail: text('detail'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
