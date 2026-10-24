#!/usr/bin/env -S npx tsx
// Moves every tenant's stored connection string onto the keyring's current key
// (spec 0003, docs/specs/0003-encryption-key-rotation/index.md). You run this
// yourself, from your own machine. There is no scheduled Worker and no admin
// route.
//
// Scheduled rotation (the key only, no tenant notices):
//   1. Add the new key to TENANT_CONN_KEYRING and deploy it, current unchanged.
//   2. Make it `current` and deploy again.
//   3. npm run rotate:keys -- --dry-run     (then the real run below)
//      npm run rotate:keys
//   The full procedure, with undo steps, is in
//   docs/runbooks/encryption-key-rotation.md. Read it before a real run.
//
// Emergency rotation (the key AND every tenant's database password):
//   npm run rotate:keys -- --emergency
//   For each tenant it asks Neon for the default branch and the one database,
//   resets the role's password, builds a new connection string from Neon,
//   checks that it connects, and stores it under the current key. It never
//   decrypts the old stored value, so it also recovers every tenant when the
//   old key is lost.
//
// Requires a .env with CATALOG_DATABASE_URL and TENANT_CONN_KEYRING (same values
// as your Worker secrets), plus NEON_API_KEY for --emergency.
//
// Flags:
//   --dry-run            Validate the keyring, read and decrypt every row, report
//                        rows per key id and the orgs that would change. Writes
//                        nothing, not even a run row.
//   --emergency          Also reset passwords through Neon. Asks for a typed
//                        confirmation first.
//   --org-id <id>        Only this tenant (for drills, or to repeat one tenant).
//   --abandon-run <id>   Mark a stuck `running` run as `failed`.
//
// Keys, passwords and connection strings are never printed or stored in a run
// note. Only org ids, key ids, counts and short reason codes are.

import 'dotenv/config'
import dns from 'node:dns'
import { createInterface } from 'node:readline/promises'
import { Command } from 'commander'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { and, eq, sql } from 'drizzle-orm'
import {
  ConnectionStringDecryptError,
  KeyringError,
  decryptConnectionString,
  encryptConnectionString,
  parseKeyring,
  readKeyPrefix,
  LEGACY_KEY_ID,
  type Keyring,
} from '../src/worker/lib/crypto'
import {
  NeonApiError,
  getConnectionUri,
  getDefaultBranchId,
  getTenantDatabase,
  resetRolePassword,
} from '../src/worker/lib/neon-api'
import { keyRotationRuns, tenantProjects } from '../drizzle/catalog/schema'

// See scripts/seed-tenant.ts for why this is needed: Node's fetch prefers
// IPv6, which breaks Neon connectivity on networks where IPv6 doesn't
// actually route.
dns.setDefaultResultOrder('ipv4first')

const program = new Command()
program
  .option('--dry-run', 'Validate and report only, write nothing', false)
  .option('--emergency', 'Also reset every tenant database password through Neon', false)
  .option('--org-id <orgId>', 'Only this one Clerk organization ID (default: all tenants)')
  .option('--abandon-run <id>', 'Mark a stuck running run as failed, then exit')
  .parse(process.argv)

const opts = program.opts<{
  dryRun: boolean
  emergency: boolean
  orgId?: string
  abandonRun?: string
}>()

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// After a password reset Neon applies the change to the compute asynchronously,
// so the first connection attempts can still be refused. Wait for it.
const CONNECT_ATTEMPTS = 8
const CONNECT_DELAY_MS = 1500

type CatalogDb = ReturnType<typeof createCatalogDb>
type TenantRow = typeof tenantProjects.$inferSelect

function createCatalogDb(url: string) {
  return drizzle(neon(url))
}

// A mistake in how the script was run (bad flag, missing env var). The message
// is written by this script, so it is safe to print.
class UsageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UsageError'
  }
}

// A step failed for a reason worth a fixed code in the run note.
class RotationStepError extends Error {
  readonly reason: string
  constructor(reason: string) {
    super(`Rotation step failed: ${reason}`)
    this.name = 'RotationStepError'
    this.reason = reason
  }
}

// ── error text that is safe to print and to store ───────────────────────────

function readCode(err: unknown): string | null {
  let current: unknown = err
  for (let depth = 0; depth < 8 && current instanceof Error; depth++) {
    const code = (current as { code?: unknown }).code
    if (typeof code === 'string') return code
    current = (current as { cause?: unknown }).cause ?? (current as { sourceError?: unknown }).sourceError
  }
  return null
}

// A fixed reason code or HTTP status. Never the message of an unknown error,
// which could quote a connection string.
function reasonOf(err: unknown): string {
  if (err instanceof RotationStepError) return err.reason
  if (err instanceof ConnectionStringDecryptError) return `decrypt_${err.code}`
  if (err instanceof NeonApiError) return `neon_${err.step}_${err.status ?? 'invalid_response'}`
  const code = readCode(err)
  if (code) return `db_${code}`
  return `error_${err instanceof Error ? err.name : 'unknown'}`
}

// For the terminal: our own errors say what is wrong. Anything else prints its
// type and code only.
function describeError(err: unknown): string {
  if (
    err instanceof UsageError ||
    err instanceof RotationStepError ||
    err instanceof KeyringError ||
    err instanceof ConnectionStringDecryptError ||
    err instanceof NeonApiError
  ) {
    return err.message
  }
  const code = readCode(err)
  return `${err instanceof Error ? err.name : 'Error'}${code ? ` (${code})` : ''}`
}

function isFetchFailure(err: unknown): boolean {
  let current: unknown = err
  for (let depth = 0; depth < 8 && current instanceof Error; depth++) {
    if (current.name === 'TypeError' && current.message === 'fetch failed') return true
    current = (current as { cause?: unknown }).cause ?? (current as { sourceError?: unknown }).sourceError
  }
  return false
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

// ── reading rows ────────────────────────────────────────────────────────────

// The key id a row is stored under. A value with no prefix is read as k1.
function storedKeyId(row: TenantRow): { keyId: string; legacy: boolean } {
  const prefix = readKeyPrefix(row.encryptedConnectionString)
  if (!prefix) return { keyId: 'unreadable', legacy: false }
  return prefix.keyId === null ? { keyId: LEGACY_KEY_ID, legacy: true } : { keyId: prefix.keyId, legacy: false }
}

// Rows to change: the prefix is not `<current>:`, or there is no prefix.
function needsRotation(row: TenantRow, keyring: Keyring): boolean {
  const prefix = readKeyPrefix(row.encryptedConnectionString)
  return prefix === null || prefix.keyId !== keyring.current
}

async function loadRows(db: CatalogDb): Promise<TenantRow[]> {
  // Every status, because a suspended or failed tenant still has a stored value
  // that must move off the old key.
  const rows = opts.orgId
    ? await db.select().from(tenantProjects).where(eq(tenantProjects.orgId, opts.orgId))
    : await db.select().from(tenantProjects)
  if (opts.orgId && rows.length === 0) {
    throw new UsageError(`No tenant found for org id "${opts.orgId}".`)
  }
  return rows.sort((a, b) => a.orgId.localeCompare(b.orgId))
}

async function findRunningRun(db: CatalogDb): Promise<string | null> {
  const [running] = await db
    .select({ id: keyRotationRuns.id })
    .from(keyRotationRuns)
    .where(eq(keyRotationRuns.status, 'running'))
    .limit(1)
  return running?.id ?? null
}

// ── --abandon-run ───────────────────────────────────────────────────────────

async function abandonRun(db: CatalogDb, id: string): Promise<void> {
  if (!UUID_PATTERN.test(id)) throw new UsageError('--abandon-run needs the run id, a uuid like the one the script printed.')

  const updated = await db
    .update(keyRotationRuns)
    .set({
      status: 'failed',
      finishedAt: new Date(),
      note: sql`coalesce(${keyRotationRuns.note} || '; ', '') || 'abandoned by operator'`,
    })
    .where(and(eq(keyRotationRuns.id, id), eq(keyRotationRuns.status, 'running')))
    .returning({ id: keyRotationRuns.id })

  if (updated.length === 1) {
    console.log(`✓ Run ${id} marked failed. You can start a new run now.`)
    return
  }

  const [existing] = await db
    .select({ status: keyRotationRuns.status })
    .from(keyRotationRuns)
    .where(eq(keyRotationRuns.id, id))
    .limit(1)
  throw new UsageError(
    existing
      ? `Run ${id} is already ${existing.status}, so there is nothing to abandon.`
      : `No run found with id ${id}.`,
  )
}

// ── --dry-run ───────────────────────────────────────────────────────────────

async function dryRun(db: CatalogDb, keyring: Keyring, rows: TenantRow[]): Promise<void> {
  const currentEntry = keyring.keys.get(keyring.current)
  console.log(
    `→ Keyring OK: ${keyring.keys.size} key(s) [${[...keyring.keys.keys()].join(', ')}], ` +
      `current ${keyring.current}${currentEntry ? ` (created ${currentEntry.createdAt})` : ''}.`,
  )
  if (opts.emergency) {
    const present = Boolean(process.env.NEON_API_KEY)
    console.log(`→ Emergency mode: NEON_API_KEY is ${present ? 'set' : 'MISSING (a real run needs it)'}.`)
  }

  const perKey = new Map<string, { rows: number; legacy: number }>()
  const wouldChange: string[] = []
  const unreadable: Array<{ orgId: string; reason: string }> = []

  for (const row of rows) {
    const { keyId, legacy } = storedKeyId(row)
    const bucket = perKey.get(keyId) ?? { rows: 0, legacy: 0 }
    bucket.rows++
    if (legacy) bucket.legacy++
    perKey.set(keyId, bucket)

    if (needsRotation(row, keyring)) wouldChange.push(row.orgId)

    // Confirms the keyring can read this row.
    try {
      await decryptConnectionString(row.encryptedConnectionString, keyring, row.orgId)
    } catch (err) {
      unreadable.push({ orgId: row.orgId, reason: reasonOf(err) })
    }
  }

  console.log(`\n→ ${rows.length} tenant row(s)${opts.orgId ? ` (org ${opts.orgId} only)` : ''}. Rows per key id:`)
  if (perKey.size === 0) console.log('    (none)')
  for (const [keyId, { rows: count, legacy }] of [...perKey.entries()].sort()) {
    const marker = keyId === keyring.current ? ' (current)' : ''
    const legacyNote = legacy > 0 ? `, ${legacy} with no prefix (old format)` : ''
    console.log(`    ${keyId}${marker}: ${count} row(s)${legacyNote}`)
  }

  if (wouldChange.length === 0) {
    console.log(`\n→ Every row is already on ${keyring.current}. A real run would finish at once with 0 tenants.`)
  } else {
    console.log(
      `\n→ ${wouldChange.length} row(s) would change${opts.emergency ? ' (and have their database password reset)' : ''}:`,
    )
    for (const orgId of wouldChange) console.log(`    ${orgId}`)
  }

  if (unreadable.length > 0) {
    console.log(`\n${opts.emergency ? '⚠' : '✗'} ${unreadable.length} row(s) this keyring cannot read:`)
    for (const { orgId, reason } of unreadable) console.log(`    ${orgId}: ${reason}`)
    if (opts.emergency) {
      console.log('  Emergency mode never decrypts old values, so these are rebuilt from Neon in a real run.')
    } else {
      console.log('  Fix the keyring (the old key may be missing) before a real run. Do not deploy it as it is.')
      process.exitCode = 1
    }
  } else {
    console.log('\n✓ Every row decrypts with this keyring.')
  }

  const running = await findRunningRun(db)
  if (running) {
    console.log(`\n⚠ A rotation run is marked running (${running}). A real run will refuse to start until it is cleared.`)
  }

  console.log('\nDry run complete. Nothing was written.')
}

// ── one tenant ──────────────────────────────────────────────────────────────

type Outcome = { status: 'done'; detail?: string } | { status: 'failed'; reason: string; stop: boolean }

// Compare and swap: only writes if the row still holds the value we read.
async function swapValue(db: CatalogDb, row: TenantRow, next: string): Promise<boolean> {
  const updated = await db
    .update(tenantProjects)
    .set({ encryptedConnectionString: next, updatedAt: new Date() })
    .where(
      and(
        eq(tenantProjects.orgId, row.orgId),
        eq(tenantProjects.encryptedConnectionString, row.encryptedConnectionString),
      ),
    )
    .returning({ id: tenantProjects.id })
  return updated.length === 1
}

// The new value must decrypt back to exactly what we meant to store.
async function verifyRoundTrip(keyring: Keyring, next: string, orgId: string, expected: string): Promise<void> {
  try {
    const check = await decryptConnectionString(next, keyring, orgId)
    if (check.plaintext !== expected || check.keyId !== keyring.current) throw new RotationStepError('verify_failed')
  } catch (err) {
    if (err instanceof RotationStepError) throw err
    throw new RotationStepError('verify_failed')
  }
}

async function rotateScheduled(db: CatalogDb, keyring: Keyring, row: TenantRow): Promise<Outcome> {
  try {
    const { plaintext } = await decryptConnectionString(row.encryptedConnectionString, keyring, row.orgId)
    const next = await encryptConnectionString(plaintext, keyring, row.orgId)
    await verifyRoundTrip(keyring, next, row.orgId, plaintext)

    if (await swapValue(db, row, next)) return { status: 'done' }

    // The row changed after we read it (for example the queue consumer wrote it).
    // If it now sits on the current key there is nothing left to do.
    const [latest] = await db
      .select({ value: tenantProjects.encryptedConnectionString })
      .from(tenantProjects)
      .where(eq(tenantProjects.orgId, row.orgId))
      .limit(1)
    if (latest && readKeyPrefix(latest.value)?.keyId === keyring.current) {
      return { status: 'done', detail: `changed during the run, already on ${keyring.current}` }
    }
    return { status: 'failed', reason: 'cas_conflict', stop: false }
  } catch (err) {
    return { status: 'failed', reason: reasonOf(err), stop: false }
  }
}

// Asks Neon for the connection string again on each attempt, because the first
// few can still carry the old password or be refused while Neon applies the
// reset to the compute.
async function connectWithRetry(
  neonApiKey: string,
  row: TenantRow,
  target: { branchId: string; databaseName: string; roleName: string },
): Promise<string> {
  for (let attempt = 1; attempt <= CONNECT_ATTEMPTS; attempt++) {
    try {
      const uri = await getConnectionUri(neonApiKey, row.neonProjectId, target)
      await neon(uri).query('select 1')
      return uri
    } catch {
      if (attempt < CONNECT_ATTEMPTS) await sleep(CONNECT_DELAY_MS * attempt)
    }
  }
  throw new RotationStepError('connect_check_failed')
}

async function rotateEmergency(
  db: CatalogDb,
  keyring: Keyring,
  neonApiKey: string,
  row: TenantRow,
): Promise<Outcome> {
  // Before the reset nothing has changed, so a failure only skips this tenant.
  // From the reset on, the tenant's password differs from what the catalog
  // holds, so a failure stops the run.
  let passwordWasReset = false
  try {
    const branchId = await getDefaultBranchId(neonApiKey, row.neonProjectId)
    const database = await getTenantDatabase(neonApiKey, row.neonProjectId, branchId)

    // From here on assume the password may change. The one exception is a
    // definite 4xx answer to the reset itself, which means Neon refused and
    // nothing changed, so that tenant is skipped like any earlier failure.
    passwordWasReset = true
    try {
      // The response holds the new password. It is deliberately not kept: the
      // connection string below is fetched from Neon, never built from it.
      await resetRolePassword(neonApiKey, row.neonProjectId, branchId, database.ownerName)
    } catch (err) {
      if (err instanceof NeonApiError && err.status !== null && err.status >= 400 && err.status < 500) {
        passwordWasReset = false
      }
      throw err
    }

    const uri = await connectWithRetry(neonApiKey, row, {
      branchId,
      databaseName: database.name,
      roleName: database.ownerName,
    })

    const next = await encryptConnectionString(uri, keyring, row.orgId)
    await verifyRoundTrip(keyring, next, row.orgId, uri)

    if (!(await swapValue(db, row, next))) {
      return { status: 'failed', reason: 'cas_conflict_after_reset', stop: true }
    }
    return { status: 'done' }
  } catch (err) {
    return { status: 'failed', reason: reasonOf(err), stop: passwordWasReset }
  }
}

// ── a real run ──────────────────────────────────────────────────────────────

async function confirmEmergency(count: number): Promise<void> {
  if (!process.stdin.isTTY) {
    throw new UsageError('--emergency asks for a typed confirmation, so it needs an interactive terminal.')
  }
  console.log(
    `\n⚠ EMERGENCY rotation. This resets the database password of ${count} tenant(s) through Neon.\n` +
      `  Their old passwords stop working. Cached connection strings recover on their own within a few minutes.`,
  )
  const expected = `reset ${count}`
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = (await rl.question(`  Type "${expected}" to continue: `)).trim().toLowerCase()
    if (answer !== expected) throw new UsageError('Confirmation did not match. Nothing was changed.')
  } finally {
    rl.close()
  }
}

async function realRun(db: CatalogDb, keyring: Keyring, rows: TenantRow[]): Promise<void> {
  const neonApiKey = process.env.NEON_API_KEY
  if (opts.emergency && !neonApiKey) throw new UsageError('--emergency needs NEON_API_KEY in your .env.')

  const selected = rows.filter((row) => needsRotation(row, keyring))
  const fromKeyIds = [...new Set(selected.map((row) => storedKeyId(row).keyId))].sort()
  const kind = opts.emergency ? 'emergency' : 'scheduled'

  console.log(
    `→ ${kind} rotation to ${keyring.current}: ${selected.length} of ${rows.length} tenant row(s) to change` +
      `${fromKeyIds.length > 0 ? ` (from ${fromKeyIds.join(', ')})` : ''}.`,
  )

  const running = await findRunningRun(db)
  if (running) {
    throw new UsageError(
      `A rotation run is still marked running (${running}). If it crashed, clear it with:\n` +
        `  npm run rotate:keys -- --abandon-run ${running}`,
    )
  }

  if (opts.emergency && selected.length > 0) await confirmEmergency(selected.length)

  let runId: string
  try {
    const [created] = await db
      .insert(keyRotationRuns)
      .values({
        kind,
        fromKeyId: fromKeyIds.join(',') || keyring.current,
        toKeyId: keyring.current,
        tenantsTotal: selected.length,
      })
      .returning({ id: keyRotationRuns.id })
    runId = created.id
  } catch (err) {
    // The partial unique index allows one running run. We lost a race.
    if (readCode(err) === '23505') throw new UsageError('Another rotation run started at the same moment. Try again later.')
    throw err
  }
  console.log(`→ Run ${runId} started.\n`)

  let done = 0
  let failed = 0
  let stoppedAfter: string | null = null
  const failures: string[] = []

  for (const row of selected) {
    const outcome =
      opts.emergency && neonApiKey
        ? await rotateEmergency(db, keyring, neonApiKey, row)
        : await rotateScheduled(db, keyring, row)

    if (outcome.status === 'done') {
      done++
      console.log(`  ✓ ${row.orgId}${outcome.detail ? ` (${outcome.detail})` : ''}`)
    } else {
      failed++
      failures.push(`${row.orgId}:${outcome.reason}`)
      console.error(`  ✗ ${row.orgId}: ${outcome.reason}`)
      if (outcome.stop) stoppedAfter = row.orgId
    }

    await db
      .update(keyRotationRuns)
      .set({ tenantsDone: done, tenantsFailed: failed, note: failures.join('; ').slice(0, 4000) || null })
      .where(eq(keyRotationRuns.id, runId))

    if (stoppedAfter) break
  }

  // Completed only when every selected row ended on the current key.
  const completed = failed === 0 && done === selected.length
  const note = [...failures, stoppedAfter ? `stopped_after:${stoppedAfter}` : null].filter(Boolean).join('; ')
  await db
    .update(keyRotationRuns)
    .set({
      status: completed ? 'completed' : 'failed',
      tenantsDone: done,
      tenantsFailed: failed,
      note: note.slice(0, 4000) || null,
      finishedAt: new Date(),
    })
    .where(eq(keyRotationRuns.id, runId))

  console.log(`\n${completed ? '✅' : '❌'} Run ${runId} ${completed ? 'completed' : 'failed'}: ${done} done, ${failed} failed, ${
    selected.length - done - failed
  } not attempted.`)

  if (completed) {
    if (selected.length === 0) {
      console.log(`\nNothing to rotate: every row is already on ${keyring.current}.`)
    } else if (opts.emergency) {
      console.log(
        '\nNext: run --dry-run and confirm zero rows on old key ids, then remove the old key from the keyring\n' +
          'at once (it is compromised, there is no soak) and run `npx wrangler secret put TENANT_CONN_KEYRING`.',
      )
    } else {
      console.log(
        '\nNext: run --dry-run and confirm zero rows on old key ids. Keep the old key in the live keyring for\n' +
          'about 7 days, then remove it and run `npx wrangler secret put TENANT_CONN_KEYRING`.',
      )
    }
    return
  }

  process.exitCode = 1
  if (stoppedAfter) {
    console.error(
      `\nThe run stopped at ${stoppedAfter}. Its database password may have been reset without the catalog being updated.\n` +
        `Repair it with: npm run rotate:keys -- --emergency --org-id ${stoppedAfter}\n` +
        'Then run again to continue with the remaining tenants.',
    )
  } else {
    console.error('\nSome rows are still on an old key. Fix the cause above and run again: only those rows are touched.')
  }
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  const { CATALOG_DATABASE_URL, TENANT_CONN_KEYRING } = process.env
  if (!CATALOG_DATABASE_URL) throw new UsageError('Missing required env var: CATALOG_DATABASE_URL')

  if (opts.abandonRun && (opts.dryRun || opts.emergency || opts.orgId)) {
    throw new UsageError('--abandon-run cannot be combined with other flags.')
  }

  const db = createCatalogDb(CATALOG_DATABASE_URL)

  if (opts.abandonRun) {
    await abandonRun(db, opts.abandonRun)
    return
  }

  // Fails fast on a bad keyring (AC-1) and prints the key age warning (AC-12).
  const keyring = parseKeyring(TENANT_CONN_KEYRING)

  const rows = await loadRows(db)

  if (opts.dryRun) {
    await dryRun(db, keyring, rows)
    return
  }

  await realRun(db, keyring, rows)
}

main().catch((err: unknown) => {
  console.error(`❌ rotate:keys failed: ${describeError(err)}`)
  if (isFetchFailure(err)) {
    console.error(
      "\n💡 Node's fetch could not reach Neon. See scripts/seed-tenant.ts for the IPv6 background. If this keeps\n" +
        '   happening on your network, a `pg` variant of this script is the planned fix (spec 0003 follow up).',
    )
  }
  process.exit(1)
})
