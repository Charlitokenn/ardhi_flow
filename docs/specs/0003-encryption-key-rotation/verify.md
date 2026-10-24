# Verify: Encryption key rotation strategy · spec 0003 · updated 2026-10-24
_Steps derived from spec 0003 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Run from `apps/web`. Needs `CATALOG_DATABASE_URL`, `TENANT_CONN_KEYRING` and (for emergency steps) `NEON_API_KEY` in `.env`. Drill steps use throwaway orgs named `drill-...` on the deployed Worker, the only environment.

## UI / manual
- [ ] Deploy with `TENANT_CONN_KEYRING` set, sign in as a test tenant, open any page that reads tenant data → data loads, no 500                                  → AC-1, AC-3
- [ ] Deploy (or run `wrangler dev`) with `TENANT_CONN_KEYRING` unset, call a tenant route → clear "Server configuration error" 500, Worker log names the problem and prints no key material → AC-1
- [ ] Set the keyring `createdAt` for `current` to a date 340 days ago, deploy, make one request → exactly one `[key-rotation] ... days old` warning per isolate start, none per request → AC-12 · Key age warning row
- [ ] Create a new Clerk organization while the keyring `current` is `k2` → the new `tenant_projects` row's value starts with `k2:` → AC-2 · Queue consumer rows (key id, org id)
- [ ] Copy tenant A's `encrypted_connection_string` into tenant B's row, call a tenant route as B → 500 "Tenant connection is unavailable", log names B's org id and the key id, never the value → AC-3 · Resolver decrypt row (org id)
- [ ] Change one row's prefix to a key id that is not in the keyring (for example `k9:`), call a tenant route as that tenant → same 500, log names the org id and `k9` → AC-3
- [ ] Zero downtime drill: start a request loop (1 per second) against a `drill-` tenant, then follow the runbook's scheduled rotation steps 1 to 4 (add, switch, re-encrypt, verify) → no failed request in the loop, run row ends `completed` → AC-4, AC-14
- [ ] Emergency drill: same request loop on a `drill-` tenant, run `rotate:keys -- --emergency` → at most one request needs the retry and none returns an error; note the exact database error code Neon returned and that `resilient-neon.ts` matches it → AC-9, AC-10, AC-14
- [ ] Lost key drill: remove the old key from the keyring on a `drill-` tenant, deploy, run `rotate:keys -- --emergency` → the tenant works again with only `NEON_API_KEY` and catalog access → AC-11, AC-14
- [ ] Backup check: paste the key back into `.env` from the password manager entry, then from the offline copy, run `rotate:keys -- --dry-run` with each → every row decrypts both times → AC-14
- [ ] Open `docs/runbooks/encryption-key-rotation.md` → four procedures (first time setup, scheduled, emergency, lost key), backup rule, 12 month reminder, 7 day soak, other secrets checklist, drill log with real dates and results, and the catalog restore window length filled in → AC-13, AC-14
- [ ] Open `apps/web/src/client` constants and `globalConfig/index.tsx` → neither reads `TENANT_CONN_ENCRYPTION_KEY` or `TENANT_CONN_KEYRING` → AC-15

## Commands
- [ ] `npx tsc -b` → no new errors (the `broadcasts.tsx` error already exists on `main`); also typecheck `scripts/` with a temporary tsconfig, since no project config includes it → AC-1
- [ ] `grep -rn "TENANT_CONN_ENCRYPTION_KEY\|tenantConnectionEncryptionKey" apps globalConfig --include=*.ts --include=*.tsx --include=*.jsonc --include=*.json` → no matches (docs are cleaned by `/sync`) → AC-15
- [ ] `npm run db:migrate:catalog`, then `\d key_rotation_runs` in psql → table, both enums and the partial unique index `key_rotation_runs_one_running_idx` exist on the real dev catalog → AC-7
- [ ] Try inserting a second `running` row in `key_rotation_runs` → unique violation; a second `completed` row is accepted → AC-7
- [ ] Break the keyring one way at a time (missing, not JSON, `current` not in `keys`, key of 31 or 33 bytes, bad base64, bad `createdAt`) and run `npm run rotate:keys -- --dry-run` → each fails with a message that names the problem and prints no key material, exit 1 → AC-1
- [ ] `npm run rotate:keys -- --dry-run` with legacy and `k1:` rows → counts per key id (legacy shown as "no prefix"), orgs that would change, "every row decrypts"; `select count(*) from key_rotation_runs` unchanged and no row changed → AC-8
- [ ] Put one row on a key id missing from the keyring, run `--dry-run` → that org is listed with `decrypt_unknown_key`, exit code 1; with `--dry-run --emergency` the same row is listed but exit code 0 → AC-8, AC-11
- [ ] `npm run rotate:keys` with `current` = `k2` and rows on `k1` and unprefixed → every row becomes `k2:...`; a follow up `--dry-run` shows zero rows on old key ids; run row `completed` with matching counts → AC-5, AC-7 · Script row selection row
- [ ] Run `npm run rotate:keys` again with every row on `current` → run completes at once with 0 tenants and a new run row → AC-7
- [ ] Rotate a row, then decrypt the old and new value with the matching org id → both give the same connection string (the script's own pre-write check also passes) → AC-5 · Script re-encrypt row (org id)
- [ ] Rewrite one row from another connection just before the script's update (queue consumer upsert) → script skips it and lists it, or counts it done if it landed on the current key; never overwrites a changed value → AC-6
- [ ] Kill the script (`kill -9`) after the first tenant → run stays `running`; `npm run rotate:keys` refuses and prints the id; `-- --abandon-run <id>` marks it `failed`; a rerun touches only rows still on an old key → AC-5, AC-6, AC-7
- [ ] `-- --abandon-run not-a-uuid`, `-- --abandon-run <already failed id>`, and `-- --abandon-run <id> --dry-run` → each refused with a clear message → AC-7
- [ ] `npm run rotate:keys -- --emergency` piped from `/dev/null` or with a wrong confirmation text → refused, no password reset, no run row → AC-9
- [ ] `npm run rotate:keys -- --emergency` with the typed `reset <count>` on `drill-` tenants → each row moves to the current key, its stored string connects with the new password and the old password is rejected → AC-9 · Script emergency rows (project id, branch, database and role, new password)
- [ ] Make one `drill-` tenant's Neon project unreachable (or have two databases) and run `--emergency` → that tenant is skipped with a reason code in the run note, the others finish, run ends `failed`, the skipped tenant's password was not reset → AC-9
- [ ] Confirm that the connection string `getConnectionUri` returns has the same shape as the one provisioning stores (direct, not pooled, `sslmode=require`) → AC-9 · Script emergency row (new password)
- [ ] After any failed or emergency run: `select kind, from_key_id, to_key_id, status, tenants_total, tenants_done, tenants_failed, note from key_rotation_runs order by started_at desc;` → `from_key_id`, `to_key_id`, `kind` match what ran, counters match, `note` holds only org ids and reason codes → AC-7 · Run record rows
- [ ] Search script output, run notes and Worker logs from every run above for the keyring, any key, any `npg_` password and `postgresql://` strings → none found → AC-1, AC-3, AC-9
- [ ] Unit style check of the resolver retry: with a cached stale password, one request fails once internally and succeeds; a second failure is returned; a non-authentication error is never retried; a `db.batch()` is retried too → AC-10

## Acceptance-criteria coverage
- AC-1 covered by the missing keyring page check, the broken keyring commands, the tsc step and the leak search · AC-2 covered by the new Clerk org step and the rotate step · AC-3 covered by the copy between rows, unknown key id and first page load steps · AC-4 covered by the zero downtime drill · AC-5 covered by the rotate, re-encrypt and resume steps · AC-6 covered by the rewrite-just-before-update and resume steps · AC-7 covered by the migration, second running row, rotate, repeat, abandon and run record steps · AC-8 covered by both dry run steps · AC-9 covered by the confirmation, emergency drill, skip and URI shape steps · AC-10 covered by the emergency drill and retry check steps · AC-11 covered by the lost key drill and the `--dry-run --emergency` step · AC-12 covered by the 340 day page check · AC-13 covered by the runbook review step · AC-14 covered by the three drills, the backup check and the runbook review · AC-15 covered by the grep and client constants steps
