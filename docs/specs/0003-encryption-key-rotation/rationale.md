# 0003. Rationale: rotate the tenant connection encryption key without downtime

The build spec is in [index.md](index.md). This file holds the reasoning and the options, which a build does not need.

## Context

> ⚠️ Premise note: Rotating this key only limits damage when the key leaks without the catalog data, or the catalog data leaks without the key. The Worker holds both the key and read access to the catalog, so anyone who gets both has every tenant's database password, and a new key does not undo that. The fix for that case is resetting each tenant's database password, which is what emergency mode does. The KV cache also keeps decrypted connection strings for 5 minutes, outside what this key protects. That is flagged in Follow up rather than solved here.

ArdhiFlow gives every customer organization its own Neon project. The address and password for each project are stored in the catalog table `tenant_projects` as an AES GCM encrypted string. One key, the Worker secret `TENANT_CONN_ENCRYPTION_KEY`, encrypts all of them. The queue consumer and the provisioning script encrypt with it, and the tenant resolver and four operator scripts decrypt with it.

The current setup has three gaps. First, the stored text carries no marker of which key made it, so a second key cannot coexist with the first, and a rotation would have to re encrypt every tenant in one step with the app stopped. Second, losing the key means losing access to every tenant, and the only note about it is a comment in `crypto.ts` saying to back it up. Third, the resolver decrypts only on a cache miss, so a changed key has no effect on cached values, and a changed database password leaves the cache pointing at the old password for up to 5 minutes.

The constraints are small and specific. One person builds and operates the system. There are no live tenants yet, so the first rotation can be rehearsed on test data. The engineer wants both a yearly schedule and an emergency path, no downtime for the scheduled one, and a way back if the key is ever lost. Everything already runs on Cloudflare Workers, Neon, and operator scripts run from a laptop.

Not deciding means the first live tenant arrives with an unrotatable key and no recovery story. Retrofitting a version marker onto live data later is possible but riskier than doing it while only test data exists.

## Options considered

### Option 1: Keep the single key and rotate in a maintenance window

Leave the format alone. To rotate, stop traffic, decrypt every row with the old key, encrypt with the new key, swap the secret, and start traffic again. Document it and keep a backup of the key.

**Pros**:
- No format change and no new table.
- Smallest amount of code.

**Cons**:
- Downtime for every tenant on every rotation, which breaks the zero downtime requirement.
- No way to tell old rows from new rows, so a half finished run cannot be resumed safely.
- A crash mid run can strand rows that no single key can read.

### Option 2: Versioned keyring with a script that moves rows gradually

Store several keys at once in one secret, tag every stored value with its key id, let the Worker read any listed key, and move rows to the current key with an operator script while the app runs. Old keys leave the keyring only when no row uses them.

**Pros**:
- Zero downtime, resumable, and each stored value says which key to use.
- Small change in the Worker (a few functions) and no new infrastructure.
- The same script handles the emergency path and lost key recovery.

**Cons**:
- Six call sites change signature at once.
- A few phases to get right in order, so it needs a runbook and drills.
- A plaintext keyring is needed locally while a run is in progress.

### Option 3: Envelope encryption with one data key per tenant

Give each tenant its own random data key, store it encrypted under a master key, and encrypt that tenant's connection string with its data key. Rotating the master key only rewraps the small data keys.

**Pros**:
- Rotating the master key touches less data, which matters at thousands of tenants.
- A single tenant's data key can be rotated on its own.

**Cons**:
- Adds a second layer and a second place where keys live, for a system with no live tenants.
- Each connection string is already tiny, so the saving only appears at a scale that is not in the engineer's answers.
- The master key still needs everything Option 2 needs (versions, a procedure, a backup).

### Option 4: An external key management service (AWS KMS or Google Cloud KMS)

Keep the master key inside a managed key service. The Worker calls the service to decrypt, and the provider handles rotation and access audit.

**Pros**:
- The key never leaves a hardware backed service, and rotation and access logs come built in.
- Moves key custody off your own machine.

**Cons**:
- A network call on every cache miss, from an edge runtime, to a second cloud vendor.
- A new account, new credentials to protect (which are themselves a secret in the Worker), and a new bill for a project with no live tenants.
- More to operate on a quiet day than a script you already know how to run.

## Rationale

Option 2 is the choice because it is the only one that meets the zero downtime requirement without adding new infrastructure. Option 1 fails that requirement outright. Options 3 and 4 solve problems the engineer does not have yet (thousands of tenants, a compliance need for hardware held keys) and still need the version and procedure work that Option 2 provides. If either need appears later, Option 2 is a clean stepping stone, because the key id prefix already lets a value say how it was protected.

The specific calls inside Option 2, each with its runner up:

- **One JSON keyring secret** over one secret per version plus a pointer. A single secret changes atomically, so the key list and the current marker can never disagree. Runner up: separate secrets. Cloudflare Secrets Store needs a binding in `wrangler.jsonc` for each key and its documentation still marks it as beta, so it adds config work for no gain here.
- **A prefix inside the stored text** over a new column. One value, one write, nothing to drift. Runner up: a `key_version` column, which makes counting rows easier but lets the column and the value disagree.
- **Resolver retries once** over accepting up to 5 minutes of errors after an emergency reset. A cached old password is the one thing an emergency run cannot fix from outside the Worker, because the script has no access to the KV namespace without more credentials. Runner up: accept errors until the cache expires. Two database roles per tenant would give true zero downtime but needs grants and ownership moves in every tenant database, which is too heavy for an emergency path.
- **An operator script** over a scheduled Worker or an admin route. The repo already runs `migrate:tenants` and `provision:tenant` this way, and a script adds no public surface. Runner up: a Cron Trigger Worker, which would remove the need to remember but puts the old key, the new key, and the Neon API key in a long running public service.
- **Emergency mode builds values from Neon, not from the old value.** One code path then serves both an emergency and a lost key, and every drill of the emergency path also exercises the last resort. Runner up: read the role and database from the old connection string, which is more faithful but cannot work when the key is lost.
- **Bound data (org id and key id)** costs nothing extra because the format changes anyway, and stops a value being swapped between tenants. Runner up: no bound data, which is simpler but leaves that swap undetected.
- **12 month cadence, 7 day soak, new `key_rotation_runs` table, password manager plus offline backup** are the engineer's choices, taken as given. The soak exists because a catalog restored from a pre rotation backup still holds old key values, so the old key also stays in the offline copy while such restore points exist.
- **Sequential processing.** Tenant counts are small, and an emergency run is safer when it stops at the first failure at or after a password reset, leaving at most one tenant to repair. A failure before any reset changes nothing, so that tenant is skipped and the rest continue.
- **Dry run as the keyring check, no key generator helper.** A typo in the keyring can take the app down the moment it is deployed, so `--dry-run` validates it and reads every row first. A helper that prints the next keyring would add surface for a step done once a year. Runner up: that helper.
