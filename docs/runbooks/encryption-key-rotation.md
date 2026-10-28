# Runbook: tenant connection string key rotation

Spec: [`docs/specs/0003-encryption-key-rotation`](../specs/0003-encryption-key-rotation/index.md)

Every tenant's Neon connection string (it contains a database password) is stored encrypted in the catalog table
`tenant_projects.encrypted_connection_string`. The keys that encrypt it live in one Worker secret, `TENANT_CONN_KEYRING`.
This runbook covers replacing a key without any tenant noticing, replacing it after a leak, and recovering when it is lost.

## At a glance

| Situation | Procedure |
|---|---|
| Setting this up for the first time | [1. First time setup](#1-first-time-setup) |
| Yearly rotation (Worker logs a key age warning at 335 days) | [2. Scheduled rotation](#2-scheduled-rotation) |
| The key, or the catalog data, may have leaked | [3. Emergency rotation](#3-emergency-rotation) |
| Every copy of the key is gone | [4. Lost key recovery](#4-lost-key-recovery) |

You run all of this yourself, from your own machine, with `npm run rotate:keys` in `apps/web`. There is no scheduled job and no
admin route. The script reads `CATALOG_DATABASE_URL` and `TENANT_CONN_KEYRING` from `apps/web/.env` (and `NEON_API_KEY` for
`--emergency`).

## The keyring

```json
{
  "current": "k2",
  "keys": {
    "k1": { "key": "<base64, 32 bytes>", "createdAt": "2026-01-15" },
    "k2": { "key": "<base64, 32 bytes>", "createdAt": "2027-01-10" }
  }
}
```

- Generate a key with `openssl rand -base64 32`. Use the next integer for the id (`k3` follows `k2`).
- `createdAt` is the day the key was generated, written `YYYY-MM-DD`. The age warning counts from it.
- In `.dev.vars` and `.env` write the whole keyring as **one line of JSON inside single quotes**:
  `TENANT_CONN_KEYRING='{"current":"k2","keys":{...}}'`.
- Set the Worker secret with `npx wrangler secret put TENANT_CONN_KEYRING`, then paste the same one line.
- A stored value looks like `k2:<base64>`. The id before the colon says which key made it. A value with no prefix is the old
  format and is read as `k1`.

Rules that keep tenants online:

- `current` must be an id that is in `keys`.
- **Never delete a key from the keyring while any row still uses it.** A dry run (`--dry-run`) shows how many rows use each id.
- Before every `wrangler secret put`, save the keyring you are replacing (password manager note is fine). That is your undo.

## Backup rule

The new key goes into **both** backups before any row depends on it:

1. a password manager entry, and
2. one offline copy (printed or on a USB stick, kept somewhere else).

Retired keys stay in the offline copy for as long as any catalog restore point that used them exists, because restoring the
catalog brings back values encrypted with the old key.

**Catalog restore window:** 6 hours (Neon project `catalog`, `jolly-frog-89901747`, `history_retention_seconds: 21600`,
checked 2026-10-27). A retired key can leave the offline copy 6 hours after a dry run shows zero rows on it. Check this
again if you change Neon plan or the project's history retention setting, because a longer window means keeping keys longer.

The local `.env` holds the plaintext keyring while a run is in progress. Paste it from the password manager for the run and
delete it afterwards. `.env` is gitignored.

## Calendar reminder

Rotate every **12 months**. Put a repeating reminder in your calendar for **11 months** after each key's `createdAt`. As a
backstop, the Worker logs `[key-rotation] The current tenant encryption key kN is N days old` once each time an isolate starts
once the key is 335 days old, and `rotate:keys` prints the same warning.

## Reading what `rotate:keys` prints

- `--dry-run` writes nothing, not even a run record. It checks the keyring, decrypts **every** row, shows how many rows use each
  key id, and lists the orgs a real run would change. For a scheduled rotation it exits with an error if any row cannot be read,
  and you must fix that before going on.
- Each real run is recorded in the catalog table `key_rotation_runs` (`running`, then `completed` or `failed`, with counts and a
  `note`). The note holds only org ids and short reason codes such as `decrypt_unknown_key`, `cas_conflict`,
  `neon_list_branches_404`, `connect_check_failed`. Never a key, password or connection string.
- Look at recent runs with:
  `select kind, from_key_id, to_key_id, status, tenants_total, tenants_done, tenants_failed, note, started_at, finished_at from key_rotation_runs order by started_at desc;`
- Only one run can be `running` at a time. If the script crashed or you pressed Ctrl-C, the run stays `running` and the next
  start refuses, printing the id. Clear it with `npm run rotate:keys -- --abandon-run <id>`, then run again. Only rows still on
  an old key are touched.
- A `failed` run is never reopened. Fix the cause and run again.
- **SMS secrets (spec 0004).** The same keyring also protects each tenant's NextSMS API token and webhook verify token, stored
  in that tenant's own `sms_settings` row. After the connection strings, both `--dry-run` and a real run print an
  `SMS secrets` section: they open every tenant that has SMS set up (catalog `sms_webhook_key` set) and check, or move, those two
  values to the current key. A tenant listed with `✗` there still holds SMS secrets on an old key, and the script exits with an
  error. **Do not remove the old key from the keyring while any tenant is listed.** In an emergency rotation where the old key
  is lost, those values can't be recovered: the tenant's admin saves a new NextSMS token on the SMS settings page instead. The
  SMS pass is not counted in `key_rotation_runs`.

## 1. First time setup

Today's rows have no prefix and were written with the single key in `TENANT_CONN_ENCRYPTION_KEY`. They are read as `k1`.

1. **Back up the existing key** to the password manager and the offline copy. Do this first. A typo in the next steps must not
   cost you the key.
2. Create the keyring with the existing key's value as `k1` and `current` set to `k1`. Use the key's real creation date for
   `createdAt` (or today's date if you do not know it).
3. Put the keyring in your local `.env`, then apply the catalog migration (`npm run db:migrate:catalog`) so the
   `key_rotation_runs` table exists.
4. Run `npm run rotate:keys -- --dry-run`. Every row should decrypt and be listed as `k1` with "no prefix (old format)".
5. Run `npx wrangler secret put TENANT_CONN_KEYRING`, deploy the Worker, and confirm it serves requests for a test tenant.
   Keep the old `TENANT_CONN_ENCRYPTION_KEY` secret in place for now, the new code does not read it.
6. Run `npm run rotate:keys`. The rows are rewritten as `k1:` values with the org id bound in.
7. Run `npm run rotate:keys -- --dry-run` again and confirm every row shows as `k1` with no old format rows. Open the app as a
   test tenant.
8. Remove the old secret: `npx wrangler secret delete TENANT_CONN_ENCRYPTION_KEY`.

**Rollback.** Before step 6, redeploy the previous Worker version, which still reads the old secret. After step 6 the old Worker
cannot read the `k1:` values: restore the catalog from a Neon restore point and redeploy the previous Worker, or run
`--emergency` (procedure 3) to rebuild every value from Neon.

## 2. Scheduled rotation

Replaces the key only. Tenant database passwords do not change, so nothing breaks for tenants. Use it yearly. Example below
moves `k1` to `k2`.

1. **Add.** Generate the new key and back it up first (see the backup rule). Add it to the keyring as the next id and leave
   `current` unchanged. Put that keyring in your local `.env`, run `npm run rotate:keys -- --dry-run`, fix anything it reports,
   then `npx wrangler secret put TENANT_CONN_KEYRING`. Every Worker can now read both keys and nobody writes the new one yet.
2. **Switch.** Set `current` to the new id, run `--dry-run` again, then `secret put` again. New provisioning now uses the new
   key. Run `npx wrangler deployments list` and confirm the newest version serves all traffic, then wait about a minute.
3. **Re-encrypt.** With the same keyring in your local `.env`: `npm run rotate:keys -- --dry-run`, then `npm run rotate:keys`.
4. **Verify.** Run `npm run rotate:keys -- --dry-run` and confirm **zero rows on old key ids**. Check the run row says
   `completed` and open the app as a test tenant.
5. **Retire.** After a **7 day soak** (keep the old key in the live keyring for about a week, in case you need to roll back),
   run a dry run to confirm zero rows still use it, remove it from the keyring, and `secret put` again. Keep it in the offline
   backup while any catalog restore point that used it still exists.

The scheduled path does not touch the KV cache: the cached value is the plaintext connection string and its password has not
changed.

**Undo a phase.**

- To undo step 1, put the saved keyring back.
- To undo step 2, set `current` back to the old id and **keep both keys in the list**, because a tenant provisioned in between
  already uses the new key.
- Never delete a key from the list while any row uses it.

## 3. Emergency rotation

Use when the key, the catalog data, or both may have leaked. It replaces the key **and** resets every tenant's database
password through Neon, so the leaked connection strings stop working.

1. Do steps 1 and 2 of the scheduled rotation with a new key, **keeping the old key in the keyring** for the run (rows not yet
   reset still name it in their prefix).
2. Make sure `NEON_API_KEY` is in your local `.env`. Run `npm run rotate:keys -- --dry-run --emergency` and read the list.
3. Run `npm run rotate:keys -- --emergency`. It needs a real terminal and asks you to type `reset <count>` first. For each
   tenant, one at a time, it:
   1. lists the Neon project's branches and takes the default one,
   2. lists that branch's databases and takes the one application database and its owner role (more than one database fails
      that tenant rather than guessing),
   3. resets the role's password through Neon,
   4. fetches the new connection string from Neon and confirms it connects (it retries for a few seconds, because Neon applies
      a reset to the compute a moment later),
   5. encrypts it with the current key, swaps it into the catalog only if the row has not changed, and updates the run record.
4. After the run says `completed`, run `--dry-run` and confirm zero rows on old key ids, then **remove the old key from the
   keyring immediately** and `secret put`. There is no soak: the old key is compromised.

What happens to tenants: their cached connection string (up to 5 minutes) holds the old password. The first query that is
rejected makes the Worker drop the cache entry, re-read and decrypt the catalog value, and retry once, so at most one request per
tenant needs that retry and none should surface an error.

**If a run fails**

- A failure **before** a tenant's reset (project missing in Neon, more than one database) changes nothing: that tenant is
  recorded and skipped, the others continue, and the run ends `failed`. Fix the cause and run again: only rows still on an old
  key are touched.
- A failure **at or after** a reset (the reset call fails unclearly, the new string will not connect, the catalog write loses a
  race) stops the run at that tenant, because its database password may differ from what the catalog holds. At most one tenant
  is ever in that state. Repair it with `npm run rotate:keys -- --emergency --org-id <org id>`, which resets again and writes,
  then run again to continue with the rest.

## 4. Lost key recovery

Last resort, when no copy of an old key can be found. Tenants whose rows use that key are unreachable until their row is reset.

1. Create a keyring with **only** a new key as `current` (it can be `k1` again if the old keyring is gone, but a fresh id such as
   the next integer is easier to tell apart in the logs). Back it up (see the backup rule).
2. Put it in your local `.env` and run `npm run rotate:keys -- --dry-run --emergency`. It lists every row it cannot read. In
   emergency mode that is expected and does not fail the command.
3. `npx wrangler secret put TENANT_CONN_KEYRING`, deploy, then run `npm run rotate:keys -- --emergency`. It never decrypts old
   values: every tenant's stored value is rebuilt from Neon, so it needs only `NEON_API_KEY` and access to the catalog.
4. Run `--dry-run` and confirm every row is on the new key, then open the app as a test tenant.

## After an incident: other secrets to review

If the key or the catalog leaked, assume anything stored next to them could have too. Rotate or review:

- `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`, `CLERK_WEBHOOK_SECRET` (Clerk dashboard)
- `NEON_API_KEY` (it can reset any tenant password) and `CATALOG_DATABASE_URL` (the catalog database password)
- any other secret in `.dev.vars` or set with `wrangler secret put` (payment, SMS and similar provider keys)
- the KV cache `TENANT_CACHE`: it holds decrypted connection strings for up to 5 minutes and is **not** protected by this key.
  An emergency rotation makes those cached passwords useless, since the passwords are reset.
- Neon and Cloudflare account access: who has it, and any active API tokens.

## Things to confirm during the drills

These were written from the Neon API docs and local tests and need one look against the real services:

1. **The database error code Neon returns for a rejected password.** `src/worker/lib/resilient-neon.ts` retries on SQLSTATE
   `28P01` or `28000` and on the text "password authentication failed". Note what the emergency drill really returns and keep
   only what appears.
2. **The connection string form.** The string `getConnectionUri` fetches from Neon should have the same shape as the one
   provisioning stores (direct, not pooled, `sslmode=require`). Compare host and options on one drill tenant.
3. **How long the reset takes to apply.** The script retries the connect check up to 8 times with growing waits. Note how many
   attempts the drill needed.
4. **`list branches` accepts `limit=100`**, and the default branch carries `default: true`.

After upgrading `drizzle-orm` or `@neondatabase/serverless`, run the emergency drill again: the resolver retry client
implements the two methods Drizzle's Neon driver calls (`query` and `transaction`).

## Drill log

Each drill runs on the deployed Worker (the only environment) against throwaway tenants named `drill-...`. Write the date,
what you saw, and anything that surprised you.

| Drill | What to do | Date | Result |
|---|---|---|---|
| Backup check, password manager | Copy the key back from the password manager entry into `.env`, run `--dry-run`, confirm every row decrypts | not yet run | |
| Backup check, offline copy | Same with the offline copy | not yet run | |
| Scheduled rotation with request loop | Hit one `drill-` tenant's API once per second through steps 1 to 4 of procedure 2. Expect no failed request | not yet run | |
| Emergency rotation with request loop | Same loop through procedure 3 on a `drill-` tenant. Expect at most one request to need the retry and none to return an error | not yet run | |
| Lost key recovery | Remove the old key from the keyring, run `--emergency` on a `drill-` tenant. The tenant works again | not yet run | |
| Lost key recovery, real (not a drill) | The legacy key was replaced by a fresh `k1`, then `--emergency` rebuilt the one dev tenant from Neon. Counts as the first run on dev data, not as the `drill-` drill above | 2026-10-25 | Run `completed`, 1 tenant done, 0 failed. Dry run on 2026-10-26 showed every row on `k1` and decrypting. Old `TENANT_CONN_ENCRYPTION_KEY` Worker secret deleted 2026-10-26 |

Request loop, with your own host and a valid Clerk token for the `drill-` org:

```sh
while true; do curl -s -o /dev/null -w '%{http_code} %{time_total}s\n' -H "Authorization: Bearer $TOKEN" "https://<your-worker-host>/api/<a tenant route>"; sleep 1; done
```
