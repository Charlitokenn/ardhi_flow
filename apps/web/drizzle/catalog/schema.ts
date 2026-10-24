import { pgTable, text, timestamp, uuid, pgEnum, integer, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

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

  // AES-GCM encrypted, never plaintext. Stored as `<keyId>:<base64 of IV + ciphertext>`
  // (for example `k2:...`), where keyId names an entry in the TENANT_CONN_KEYRING
  // secret and the org id + key id are bound in as additional authenticated data.
  // A value with no prefix is the pre-rotation format and is read as key `k1`.
  // See src/worker/lib/crypto.ts and docs/specs/0003-encryption-key-rotation.
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

// One row per `npm run rotate:keys` real run (scripts/rotate-keys.ts). Dry runs
// write nothing. No foreign keys: a run only counts tenants.
export const rotationKind = pgEnum('rotation_kind', ['scheduled', 'emergency'])

export const rotationStatus = pgEnum('rotation_status', [
  'running', // in progress, or the script crashed (clear it with --abandon-run)
  'completed', // every selected row ended on the current key
  'failed', // anything else
])

export const keyRotationRuns = pgTable(
  'key_rotation_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: rotationKind('kind').notNull(),

    // Distinct old key ids found, comma separated (usually one, like `k1`).
    fromKeyId: text('from_key_id').notNull(),
    // The keyring's `current` id when the run started.
    toKeyId: text('to_key_id').notNull(),

    status: rotationStatus('status').notNull().default('running'),
    tenantsTotal: integer('tenants_total').notNull(),
    tenantsDone: integer('tenants_done').notNull().default(0),
    tenantsFailed: integer('tenants_failed').notNull().default(0),

    // Org ids and a fixed reason code or HTTP status per failure. Never raw
    // response text, a connection string, or a secret.
    note: text('note'),

    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => [
    // Only one run can be `running` at a time: every indexed row has the same
    // status value, so a second `running` row violates uniqueness.
    uniqueIndex('key_rotation_runs_one_running_idx').on(table.status).where(sql`${table.status} = 'running'`),
  ],
)
