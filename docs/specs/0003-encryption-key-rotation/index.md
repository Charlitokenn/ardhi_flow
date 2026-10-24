# 0003. Rotate the tenant connection encryption key without downtime

**Date**: 2026-10-23
**Status**: In Progress

## Summary

Every tenant's database address and password is locked with one secret key, and today there is no safe way to change that key or recover if it is lost. This spec adds a numbered key list (a keyring), tags every stored value with the key that made it, and gives you one script that moves every tenant to a new key while the app keeps running. A second mode of the same script also resets each tenant's database password, for the day a key leaks, and doubles as the recovery path if the key is ever lost. The procedure is written down as a runbook and practised on a test tenant before any live tenant exists.

## Requirements

**User stories**:

- As the operator, I want to replace the encryption key on a yearly schedule without any tenant noticing, so that a key that leaks quietly eventually stops mattering.
- As the operator, I want a fast emergency path that replaces the key and the tenants' database passwords, so that a leak of both the key and the catalog data can be contained.
- As the operator, I want to recover every tenant if the key is lost, using only the Neon account and the catalog, so that one lost secret never means losing every tenant.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):

- **AC-1**: The Worker, the queue consumer, and every operator script read keys only from one JSON secret, `TENANT_CONN_KEYRING`, shaped `{ "current": "k2", "keys": { "k1": { "key": "<base64, 32 bytes>", "createdAt": "YYYY-MM-DD" }, "k2": { ... } } }`. A missing or malformed keyring, a `current` id that is not in `keys`, a key that is not exactly 32 bytes, or bad base64 fails fast with an error that names the problem and never prints key material.
- **AC-2**: Every newly encrypted connection string is stored as `<keyId>:<base64 of IV plus ciphertext>`, encrypted with the keyring's current key using AES GCM, with the org id and key id bound in as additional authenticated data (extra data that must match at decrypt time).
- **AC-3**: A stored value decrypts with the key its prefix names, as long as that key is in the keyring. A value with no prefix (today's format) decrypts as `k1` with no bound data. A value copied into another tenant's row, or naming a key id that is not in the keyring, fails with a clear error naming the org id and key id, never the value.
- **AC-4**: During every phase of a scheduled rotation (add the new key, switch the current key, re encrypt the rows, retire the old key), tenant requests that worked before the phase keep working.
- **AC-5**: `rotate:keys` re encrypts every `tenant_projects` row that is not already on the current key (including unprefixed values), whatever the row's status, one tenant at a time. Before writing, it checks that the new value decrypts back to the original connection string.
- **AC-6**: Each write only applies if the row still holds the value the script read (compare and swap). A row that changed in the meantime is skipped and reported. Running the script again picks up only rows still on an old key, so an interrupted run resumes cleanly.
- **AC-7**: Every real run creates a `key_rotation_runs` row that moves from `running` to `completed` or `failed` and records the counts. A second run cannot start while one is `running`. `--abandon-run <id>` marks a stuck run `failed`. A run is `completed` only when every selected row ended on the current key, otherwise it is `failed`.
- **AC-8**: `--dry-run` prints how many rows use each key id and which orgs would change, and writes nothing, including no run row. It also checks the keyring against the AC-1 rules and decrypts every row to confirm the keyring can read it, listing any row it cannot.
- **AC-9**: `--emergency` also resets each tenant's database role password through the Neon API, builds the new connection string from Neon, confirms that it connects, and stores it encrypted with the current key. It works one tenant at a time and asks for typed confirmation first. A failure before the password reset (for example, the Neon project no longer exists) is recorded and that tenant is skipped, because nothing was changed. A failure at or after the reset stops the run. It never needs to decrypt the old value.
- **AC-10**: When a tenant query fails with a database authentication error, the resolver does the following at most once per request. It deletes the cached connection string, re reads and decrypts the catalog value, writes the fresh value back to the cache, and retries before any error reaches the caller. The retry covers single queries and batched transactions, because no statement has run when a password is rejected. Other errors are never retried. A second failure is returned normally.
- **AC-11**: With no usable old key, `--emergency` rebuilds every tenant's stored value from Neon alone, so all tenants recover with only `NEON_API_KEY` and catalog access.
- **AC-12**: When the current key is 335 days old or more (30 days short of the 12 month schedule), the Worker logs one warning each time an isolate (a running instance of the Worker) starts, and the script prints the same warning.
- **AC-13**: `docs/runbooks/encryption-key-rotation.md` exists and covers four procedures: first time setup, scheduled rotation, emergency rotation, and lost key recovery. It also states the backup rule, the 12 month calendar reminder, the 7 day soak, and a short checklist of other secrets to review after an incident.
- **AC-14**: The scheduled rotation (with a loop of requests running through it), the emergency rotation, and the lost key recovery are each run at least once against throwaway test orgs named `drill-...` on the deployed Worker (the only environment, and nothing is live yet). Before the lost key drill, the key is copied back from the password manager entry and from the offline copy, and `rotate:keys --dry-run` with each shows every row decrypts. The results are written in the runbook's drill log.
- **AC-15**: `TENANT_CONN_ENCRYPTION_KEY` is gone from the `Env` type, the scripts, and the code. No client code reads `TENANT_CONN_ENCRYPTION_KEY` or `TENANT_CONN_KEYRING`.

## Decision

**Chosen option**: Option 2: a versioned keyring, with every stored value tagged by its key, moved to a new key by an operator script while the Worker can read both.

Rotation is a script you run yourself, not a feature of the running app. The Worker only learns to read several key versions; the moving of data happens outside it.

**Settled choices** (from the design interview, each is a fixed requirement):

| Question | Choice |
|---|---|
| Tenants affected at first | None live yet, so the first rotation is a rehearsal on test data |
| Triggers | A 12 month calendar schedule, and emergencies |
| Downtime | None for a scheduled rotation |
| Scheduled rotation covers | The encryption key only |
| Emergency rotation covers | The encryption key and every tenant's database password |
| Key storage | One JSON keyring Worker secret |
| Version marker | A prefix inside the stored text (`k2:...`) |
| Who runs it | An operator script you run yourself, no scheduled Worker, no admin route |
| Old key retirement | Stays in the live keyring about 7 days after zero rows use it, then removed (emergency: removed at once) |
| Run history | New `key_rotation_runs` table in the catalog |
| Key backup | A password manager entry plus one offline copy |
| Cached password after an emergency reset | The resolver retries once with a fresh catalog read |
| Emergency run failures | Before a reset: skip that tenant and go on. At or after a reset: stop |
| Drill environment | The deployed Worker with throwaway `drill-` orgs, no separate staging yet |
| Keyring mistakes | `--dry-run` validates and reads every row before each `secret put`, no key generator helper |

## Rationale

Reasoning and options: see rationale.md

## Feature design

**Data model sketch**:

New table `key_rotation_runs` in the catalog database (Drizzle schema `drizzle/catalog/schema.ts`, one generated migration):

| Field | Type | Rules |
|---|---|---|
| `id` | uuid, primary key | random default |
| `kind` | enum `rotation_kind`: `scheduled`, `emergency` | required |
| `from_key_id` | text | required, the distinct old key ids found, comma separated (usually one, like `k1`) |
| `to_key_id` | text | required, the keyring's current id |
| `status` | enum `rotation_status`: `running`, `completed`, `failed` | default `running` |
| `tenants_total` | integer | required |
| `tenants_done` | integer | default 0 |
| `tenants_failed` | integer | default 0 |
| `note` | text | optional, org ids and a fixed reason code or HTTP status per failure, never raw response text or a secret |
| `started_at` | timestamptz | default now |
| `finished_at` | timestamptz | optional |

A partial unique index on `status` where `status = 'running'` allows only one active run. There are no foreign keys; runs only count tenants.

Existing table `tenant_projects` gets no new columns. The text in `encrypted_connection_string` changes shape (see below), and its schema comment is updated to say so.

**Stored value format**: `<keyId>:<base64 of 12 byte IV plus ciphertext and tag>`. The key id matches `^k[0-9]+$`. Base64 has no colon, so the prefix cannot be confused with data, and a value with no prefix is read as legacy `k1`. The additional authenticated data is the UTF 8 text `<orgId>|<keyId>`. Legacy values were written without it.

**Keyring** (Worker secret `TENANT_CONN_KEYRING`, also in the local `.dev.vars` and `.env`): the JSON in AC-1. Generate a key with `openssl rand -base64 32`. New key ids are the next integer (`k3` follows `k2`).

**State transitions**:

```
key_rotation_runs.status:  running → completed | failed
```

A failed run is never reopened. Run the script again; it starts a new run and only touches rows still on an old key.

**Interface surface** (there is no new HTTP route):

| Interface | Shape | Used by |
|---|---|---|
| `parseKeyring(raw)` in `src/worker/lib/crypto.ts` | Validates AC-1, returns a parsed keyring, logs the age warning | Worker, queue consumer, scripts |
| `encryptConnectionString(plaintext, keyring, orgId)` | Returns `<currentId>:<base64>` | Queue consumer, `provision-tenant.ts`, `rotate-keys.ts` |
| `decryptConnectionString(stored, keyring, orgId)` | Returns `{ plaintext, keyId, legacy }` | Resolver, all scripts |
| `getDefaultBranchId`, `getTenantDatabase`, `resetRolePassword`, `getConnectionUri` in `src/worker/lib/neon-api.ts` | Thin wrappers over the Neon API | `rotate-keys.ts` in emergency mode |
| Resolver retry wrapper | Wraps the Neon client given to Drizzle, covering its query and transaction calls, see AC-10 | `tenant-resolver.ts` |

`scripts/rotate-keys.ts`, run with `npm run rotate:keys -- <flags>` and the same `NODE_OPTIONS=--dns-result-order=ipv4first tsx` prefix the other scripts use:

| Flag | Meaning |
|---|---|
| `--dry-run` | Validate the keyring, read every row, report rows per key id and the orgs that would change, write nothing |
| `--emergency` | Also reset passwords through Neon, needs `NEON_API_KEY`, asks for typed confirmation |
| `--org-id <id>` | Only this tenant, for drills |
| `--abandon-run <id>` | Mark a stuck `running` run as `failed` |

**Rotation procedure (scheduled)**, the order that keeps tenants online:

1. **Add.** Generate a new key and back it up first (see Security model). Add it to the keyring as the next id and leave `current` unchanged. Run `rotate:keys --dry-run` with the new keyring in your local `.env` and fix anything it reports, then run `npx wrangler secret put TENANT_CONN_KEYRING`. Every Worker can now read both keys, and nobody writes the new one yet.
2. **Switch.** Set `current` to the new id, run `rotate:keys --dry-run` again, then run `secret put` again. New provisioning now uses the new key. Confirm with `npx wrangler deployments list` that the newest version serves all traffic, then wait about a minute.
3. **Re encrypt.** With the same keyring in your local `.env`, run `rotate:keys --dry-run`, then `rotate:keys`.
4. **Verify.** Run `rotate:keys --dry-run` again and confirm zero rows on old key ids. Check the run row shows `completed` and open the app as a test tenant.
5. **Retire.** After about 7 days, remove the old key from the keyring and run `secret put`. Keep it in the offline backup while any catalog restore point that used it still exists.

The scheduled path does not touch the KV cache, because the cached value is the plaintext connection string and its password has not changed.

**Undo a phase**: before every `secret put`, save the keyring you are replacing. To undo step 1, put the saved keyring back. To undo step 2, set `current` back to the old id and keep both keys in the list, because a tenant provisioned in between already uses the new key. Never delete a key from the list while any row uses it.

**Emergency procedure**: the same steps 1 and 2 with the new key, but keep the old key in the keyring for the run (rows not yet reset still need it), then run `rotate:keys --emergency`. After a clean verify, remove the old key at once. There is no soak, because the old key is compromised.

**Lost key recovery**: create a keyring with only a new key as `current`, deploy it, and run `rotate:keys --emergency`. The emergency mode never decrypts old values, so it works with no old key. Tenants stay unreachable until their row is reset, so this is a last resort.

**Per tenant steps in emergency mode** (all from Neon, in this order):

1. List branches for `neon_project_id` and take the default branch.
2. List its databases and take the one application database and its `owner_name` role. If there is more than one, fail this tenant rather than guess.
3. Reset that role's password (`POST .../roles/{role}/reset_password`). The old password stops working on the next connection.
4. Get the connection URI for the branch, database, and role, in the same form `createNeonProject` stores today.
5. Confirm it connects (`select 1`).
6. Encrypt with the current key, compare and swap into the catalog, update the run row.

**Value sourcing**:

| Action | Value produced or displayed | Source |
|---|---|---|
| Resolver decrypt | Which key to use | The prefix on the stored value, key bytes from the keyring entry of that id |
| Resolver decrypt | Org id for the bound data | `c.get('orgId')`, set by `clerkAuth()` from the Clerk token |
| Queue consumer encrypt | Key id to write | Keyring `current` |
| Queue consumer encrypt | Org id for the bound data | `message.body.clerkOrgId` |
| Script row selection | Rows to change | Rows where the prefix is not `<current>:`, or there is no prefix |
| Script re encrypt | Org id for old and new bound data | `tenant_projects.org_id` |
| Script emergency | Neon project id | `tenant_projects.neon_project_id` |
| Script emergency | Branch id | The branch the Neon API marks as default (confirm the field name in the build) |
| Script emergency | Database name and role | Neon list databases, `name` and `owner_name` |
| Script emergency | New password | `role.password` in the reset response, used only to fetch the URI, never logged |
| Run record | `from_key_id`, `to_key_id`, `kind` | Distinct old prefixes found, keyring `current`, the `--emergency` flag |
| Run record | `tenants_total`, counters, `note` | Row count at start, running tallies, org ids and short reasons |
| Key age warning | Current key age | Keyring `createdAt` for the `current` id |

**Key invariants**:

- Every stored value is `<keyId>:<base64>` once the first run completes, and its key id is in the keyring while any row uses it.
- `current` always exists in `keys`, and every key is 32 bytes.
- An old key is only removed from the live keyring when a dry run shows zero rows using it.
- At most one `running` run exists, enforced by the partial unique index.
- A swap never overwrites a value that changed since it was read.
- Keys, passwords, and connection strings never appear in logs, errors, run notes, or the terminal. Only org ids and key ids do.
- In emergency mode, a tenant's catalog write happens in the same loop turn as its password reset, and the run stops at the first failure at or after a reset, so at most one tenant is ever left with an unrecorded password. Run `--emergency --org-id <id>` to fix it.

**Failure modes**:

| Failure | Handling |
|---|---|
| Keyring missing or invalid at Worker start | The request fails with a clear server error, nothing is logged beyond the problem name |
| Stored value names an unknown key id | Resolver returns a 500 with org id and key id logged, the script reports the row and skips it |
| Script crashes mid run | The run stays `running`, so the next start refuses with a message, and `--abandon-run` clears it. Re running continues from rows still on an old key |
| Row changed during the run (queue consumer upsert) | Compare and swap fails, the row is skipped and listed, the next run handles it |
| Verify step fails (new value does not decrypt back) | The tenant is counted failed, nothing is written, the run ends `failed` |
| Emergency: reset succeeded but the catalog write failed | The run stops. Re run with `--emergency --org-id <id>`, which resets again and writes |
| Emergency: a Neon lookup fails before the reset (project missing, more than one database) | Nothing was changed. The tenant is recorded in the run note and skipped, the others continue, and the run ends `failed` |
| Resolver retry also fails | The authentication error is returned normally, no loop |
| Scheduled run while the keyring `current` equals every row's key | The run completes at once with zero tenants, which is a normal no op |

**Security model**:

- Only someone with the keyring and `CATALOG_DATABASE_URL` can rotate. No HTTP route is added, so there is no new public surface.
- Bound data means a connection string copied between tenants' rows fails to decrypt.
- The local `.env` holds the plaintext keyring while a run is in progress. Paste it from the password manager for the run and delete it afterwards. `.env` is already gitignored.
- Backup rule: the new key goes into the password manager entry and the offline copy before any row depends on it. Retired keys stay in the offline copy while any catalog restore point that used them exists. Record the restore window length in the runbook.
- The KV cache holds decrypted connection strings for up to 5 minutes and is outside what this key protects. See Follow up.
- No formal compliance scope was named for this feature.

**Configuration required**:

- `TENANT_CONN_KEYRING`: Worker secret, `.dev.vars`, and `.env`. Replaces `TENANT_CONN_ENCRYPTION_KEY`. In `.dev.vars` and `.env` write it as one line of JSON inside single quotes. Regenerate `worker-configuration.d.ts` with `npm run cf-typegen`.
- `NEON_API_KEY`: already exists, now also needed by `rotate:keys --emergency`.

**Critical test scenarios** (the project has no test framework, so these are drills or small one off scripts, each mapped to an acceptance criterion):

- Round trip: encrypt then decrypt with bound data works, wrong org id fails, unknown key id fails, an unprefixed value decrypts as `k1`, verifies **AC-2**, **AC-3**.
- Bad keyring: each broken shape from AC-1 is rejected with a clear message and no key material, verifies **AC-1**.
- Zero downtime drill: a loop hitting one test tenant's API every second through steps 1 to 4 of the scheduled procedure shows no failed request, verifies **AC-4**, **AC-14**.
- Resume: kill the script halfway, confirm the run stays `running`, abandon it, re run, confirm only remaining rows are touched, verifies **AC-5**, **AC-6**, **AC-7**.
- Dry run writes nothing, creates no run row, rejects a broken keyring, and lists any row it cannot decrypt, verifies **AC-1**, **AC-8**.
- Emergency drill on a throwaway tenant with a request loop: at most one request needs the retry and none reach the caller as an error, verifies **AC-9**, **AC-10**, **AC-14**.
- Emergency skip: a tenant whose Neon project lookup fails before any reset is recorded and skipped while the others finish, verifies **AC-9**.
- Backup check: copy the key back from the password manager entry and from the offline copy, run `--dry-run` with each, and confirm every row decrypts, verifies **AC-14**.
- Lost key drill on a throwaway tenant: remove the old key, run `--emergency`, tenant works again, verifies **AC-11**, **AC-14**.
- Age warning: a keyring with a key dated 340 days ago logs the warning, verifies **AC-12**.

## Migration plan

**Strategy**: No live tenants, so a short two phase move with the old secret kept as a fallback until the first run is clean.

**Phases**:

1. Build and deploy the keyring code (build plan steps 1 to 4). Create `TENANT_CONN_KEYRING` with the current key's value as `k1` and `current` set to `k1`. Keep `TENANT_CONN_ENCRYPTION_KEY` set but unused.
2. Run `rotate:keys` once. Legacy values are rewritten as `k1:` values with bound data. Verify with a dry run, then remove `TENANT_CONN_ENCRYPTION_KEY` and the legacy read path (Follow up).

**Rollback**: Before step 2, redeploy the previous Worker version, which still reads the old secret. After step 2, values are `k1:` formatted and the old Worker cannot read them, so restore from the previous Worker plus a Neon restore of the catalog, or run `--emergency` to rebuild from Neon.

**Risks**: A typo in the first keyring locks every dev tenant. Back up the key before step 1 and run `--dry-run` before the real run.

## Build plan

Tracer Bullet (the project default): thread one tenant through the new format and the scheduled rotation first, prove zero downtime, then add the emergency path, then document and clean up.

**Slice 1: new format and scheduled rotation, one tenant end to end**

1. Add keyring parsing, the versioned format, bound data, the legacy read path, and the age warning to `src/worker/lib/crypto.ts`, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-12**.
2. Switch the resolver, queue consumer, `provision-tenant.ts`, and the four migrate and seed scripts to the new functions. Replace `TENANT_CONN_ENCRYPTION_KEY` with `TENANT_CONN_KEYRING` in `Env`, run `cf-typegen`, satisfies **AC-1**, **AC-2**, **AC-3**.
3. Add `key_rotation_runs` to the catalog schema with the enums and the partial unique index, and generate the migration, satisfies **AC-7**.
4. Build `scripts/rotate-keys.ts` for the scheduled path: row selection, verify, compare and swap, run record, `--dry-run` (with keyring validation and a read check of every row), `--org-id`, `--abandon-run`, and the `rotate:keys` npm script, satisfies **AC-5**, **AC-6**, **AC-7**, **AC-8**.
5. Run the migration plan on your dev tenants: create the keyring with `k1`, run `rotate:keys`, remove the old secret, satisfies **AC-3**, **AC-5**, **AC-15**.

**Slice 2: prove zero downtime**

6. Provision a throwaway test org named `drill-...` and run the scheduled drill (`k1` to `k2`) with a request loop. Run the backup check from both backup copies. Record the results in the drill log, satisfies **AC-4**, **AC-14**.

**Slice 3: emergency and recovery**

7. Add the four Neon helpers to `neon-api.ts`. Confirm the default branch field name and that the connection URI form matches what provisioning stores, satisfies **AC-9**, **AC-11**.
8. Add `--emergency` to `rotate-keys.ts`, with typed confirmation, the connect check, skip on failures before the reset, and stop on failures at or after it, satisfies **AC-9**, **AC-11**.
9. Add the resolver retry wrapper around the Neon client passed to Drizzle. Confirm the authentication error code during the drill, satisfies **AC-10**.
10. Run the emergency drill with a request loop and the lost key drill on throwaway tenants. Record both, satisfies **AC-9**, **AC-10**, **AC-11**, **AC-14**.

**Slice 4: document and clean up**

11. Write `docs/runbooks/encryption-key-rotation.md` with the four procedures, backup rule, calendar reminder, soak, other secrets checklist, and the drill log, satisfies **AC-13**, **AC-14**.
12. Remove every remaining reference to `TENANT_CONN_ENCRYPTION_KEY`, including the two client config `env` objects, satisfies **AC-15**.

## Consequences

**Positive**:

- A leaked or aging key can be replaced with no tenant impact, on a schedule you can keep up alone.
- Losing the key stops being fatal, because Neon can rebuild every stored value.
- Each stored value says which key made it, so you can always tell what is safe to retire.
- Bound data blocks one tenant's value being swapped into another tenant's row.
- Every run leaves a record, and the same script is used for practice and for real incidents.

**Negative / tradeoffs**:

- Rotation depends on you remembering. The warning and the calendar reminder help, but nothing forces it.
- The keyring is plaintext in a local `.env` while a run is in progress.
- Emergency mode is sequential, so it is slow for many tenants, and it cannot avoid a short window where cached passwords fail.
- The resolver retry is a wrapper around the Neon client that depends on how Drizzle calls it. A Drizzle upgrade could break it, so it needs a drill after upgrades.
- Six call sites change signature at once (resolver, queue, four scripts).

**Neutral**:

- One new catalog table and one new script. The Worker gains a few functions but no new bindings or routes.
- The legacy read path exists only until the first run is clean.

## Follow-up

- [ ] Remove the legacy unprefixed read path and `TENANT_CONN_ENCRYPTION_KEY` handling once the first `rotate:keys` run is clean and a dry run shows zero unprefixed rows.
- [ ] The KV cache stores decrypted connection strings for 5 minutes, outside what this key protects. Decide separately whether to encrypt cache values or shorten the time to live. It matters most once live tenants exist.
- [ ] Remove the unused server secret entries (`catalogDbUrl`, `neonApiKey`, `clerkSecretKey`, `clerkJwtKey`) from the two client `env` objects. Vite does not expose unprefixed variables today, but the pattern invites a leak, and `clerkSecretKey` reads `CLERK_PUBLISHABLE_KEY`, which looks like a typo.
- [ ] During build step 7, confirm the Neon default branch field name, that the direct and pooled connection URIs both connect, and which form provisioning stores.
- [ ] During the emergency drill, confirm the exact database error code Neon returns for a rejected password, and set the retry check to it.
- [ ] Before the first live tenant, decide whether to keep a separate staging catalog and Worker for drills. After go live, an emergency drill resets real passwords.
- [ ] Add a `pg` variant of `rotate-keys.ts` only if the IPv6 fetch problem that needed `migrate-tenants-pg.ts` blocks the script on your network.
- [ ] Feature 16 (health checks) can report the current key age and rows per key id.
- [ ] After the build, `/sync` should update `AGENTS.md`, `context/architecture.md`, `context/build-plan.md`, `context/progress-tracker.md`, and `SCAFFOLD_NOTES.md`, which still name `TENANT_CONN_ENCRYPTION_KEY` and say no rotation strategy exists.
- [ ] Other secrets (`CLERK_SECRET_KEY`, `NEON_API_KEY`, `CATALOG_DATABASE_URL`) have no rotation procedure. They are listed in the runbook checklist only. Give them their own decision if needed.
