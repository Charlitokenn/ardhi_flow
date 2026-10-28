// Tenant Neon connection strings carry a real Postgres password, so they're
// encrypted before being written to the catalog DB — never stored plaintext.
//
// Keys live in one JSON Worker secret, TENANT_CONN_KEYRING:
//
//   { "current": "k2",
//     "keys": { "k1": { "key": "<base64, 32 bytes>", "createdAt": "2026-01-15" },
//               "k2": { "key": "<base64, 32 bytes>", "createdAt": "2027-01-10" } } }
//
// Generate a key with `openssl rand -base64 32`. New key ids are the next
// integer (`k3` follows `k2`). Every stored value is tagged with the id of the
// key that made it, `<keyId>:<base64 of IV + ciphertext + tag>`, so the Worker
// can read old and new values side by side while `rotate:keys` moves rows over.
// Losing every copy of a key means losing the values it protects, so back each
// key up outside Cloudflare (see docs/runbooks/encryption-key-rotation.md).
//
// Spec: docs/specs/0003-encryption-key-rotation/index.md
//
// Errors thrown here name the problem, the org id and the key id. They never
// contain key material, a stored value, or a connection string.

export const KEY_ID_PATTERN = /^k[0-9]+$/

// Legacy values (written before key rotation existed) have no prefix and no
// bound data. They are read as this key id.
export const LEGACY_KEY_ID = 'k1'

const KEY_BYTES = 32
const IV_BYTES = 12

// 365 days between rotations, warn once the current key is within 30 days of it.
const KEY_AGE_WARNING_DAYS = 335
const MS_PER_DAY = 86_400_000

export interface KeyringEntry {
  readonly createdAt: string
  readonly bytes: Uint8Array<ArrayBuffer>
}

export interface Keyring {
  readonly current: string
  readonly keys: ReadonlyMap<string, KeyringEntry>
}

export interface DecryptResult {
  plaintext: string
  keyId: string
  legacy: boolean
}

export class KeyringError extends Error {
  constructor(problem: string) {
    super(`TENANT_CONN_KEYRING is invalid: ${problem}`)
    this.name = 'KeyringError'
  }
}

export type DecryptFailureCode = 'malformed' | 'unknown_key' | 'auth_failed'

export class ConnectionStringDecryptError extends Error {
  readonly code: DecryptFailureCode
  readonly orgId: string
  readonly keyId: string

  constructor(code: DecryptFailureCode, orgId: string, keyId: string) {
    const reason: Record<DecryptFailureCode, string> = {
      malformed: 'stored value is not in a readable format',
      unknown_key: 'that key id is not in the keyring',
      auth_failed: 'authentication failed (wrong key, a value copied from another tenant, or an altered value)',
    }
    super(`Cannot decrypt connection string for org ${orgId} with key ${keyId}: ${reason[code]}`)
    this.name = 'ConnectionStringDecryptError'
    this.code = code
    this.orgId = orgId
    this.keyId = keyId
  }
}

// ── base64 helpers ──────────────────────────────────────────────────────────

const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

// Returns null instead of throwing, so callers choose their own safe error.
function base64ToBytes(value: string): Uint8Array<ArrayBuffer> | null {
  if (!BASE64_PATTERN.test(value)) return null
  try {
    return Uint8Array.from(atob(value), (c) => c.charCodeAt(0))
  } catch {
    return null
  }
}

// ── keyring parsing (AC-1, AC-12) ───────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// Only echo a key id when it has the expected shape, so a pasted secret in the
// wrong field is never repeated back in an error.
function safeId(id: string): string {
  return KEY_ID_PATTERN.test(id) ? `"${id}"` : '(invalid id)'
}

function parseCreatedAt(keyId: string, value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new KeyringError(`key ${safeId(keyId)} needs a createdAt date written as YYYY-MM-DD`)
  }
  const parsed = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new KeyringError(`key ${safeId(keyId)} has a createdAt that is not a real date`)
  }
  return value
}

// One warning per isolate: parseKeyring memoizes by the raw secret, so the
// warning below runs the first time an isolate (or script process) sees it.
let memo: { raw: string; keyring: Keyring } | null = null

export interface ParseKeyringOptions {
  // Injected by tests and the dry run; defaults to the real clock.
  now?: Date
}

export function parseKeyring(raw: string | undefined, options: ParseKeyringOptions = {}): Keyring {
  if (raw === undefined || raw.trim() === '') {
    throw new KeyringError('the secret is missing or empty')
  }

  if (memo && memo.raw === raw && !options.now) return memo.keyring

  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    // The parser's own message can quote part of the input, so it is dropped.
    throw new KeyringError('the value is not valid JSON')
  }

  if (!isRecord(data)) throw new KeyringError('expected a JSON object with "current" and "keys"')
  const { current, keys: rawKeys } = data
  if (typeof current !== 'string' || !KEY_ID_PATTERN.test(current)) {
    throw new KeyringError('"current" must be a key id like "k2"')
  }
  if (!isRecord(rawKeys) || Object.keys(rawKeys).length === 0) {
    throw new KeyringError('"keys" must be an object with at least one key')
  }

  const keys = new Map<string, KeyringEntry>()
  for (const [keyId, entry] of Object.entries(rawKeys)) {
    if (!KEY_ID_PATTERN.test(keyId)) {
      throw new KeyringError('a key id is not in the form "k" plus a number')
    }
    if (!isRecord(entry) || typeof entry.key !== 'string') {
      throw new KeyringError(`key ${safeId(keyId)} needs a "key" string`)
    }
    const bytes = base64ToBytes(entry.key)
    if (!bytes) throw new KeyringError(`key ${safeId(keyId)} is not valid base64`)
    if (bytes.length !== KEY_BYTES) {
      throw new KeyringError(`key ${safeId(keyId)} must be exactly ${KEY_BYTES} bytes, found ${bytes.length}`)
    }
    keys.set(keyId, { bytes, createdAt: parseCreatedAt(keyId, entry.createdAt) })
  }

  if (!keys.has(current)) {
    throw new KeyringError(`"current" is ${safeId(current)} but that id is not in "keys"`)
  }

  const keyring: Keyring = { current, keys }
  warnIfKeyIsOld(keyring, options.now ?? new Date())

  if (!options.now) memo = { raw, keyring }
  return keyring
}

// Age in whole days of the keyring's current key, from its createdAt date.
export function currentKeyAgeDays(keyring: Keyring, now: Date = new Date()): number {
  const entry = keyring.keys.get(keyring.current)
  if (!entry) return 0
  const created = new Date(`${entry.createdAt}T00:00:00Z`).getTime()
  return Math.floor((now.getTime() - created) / MS_PER_DAY)
}

function warnIfKeyIsOld(keyring: Keyring, now: Date): void {
  const age = currentKeyAgeDays(keyring, now)
  if (age >= KEY_AGE_WARNING_DAYS) {
    console.warn(
      `[key-rotation] The current tenant encryption key ${keyring.current} is ${age} days old. ` +
        `Plan a scheduled rotation (every 12 months). See docs/runbooks/encryption-key-rotation.md.`,
    )
  }
}

// ── stored value format (AC-2, AC-3) ────────────────────────────────────────

// Reads the key id prefix without decrypting. `keyId` is null for a legacy
// value with no prefix. A prefix that is not a valid key id is rejected.
export function readKeyPrefix(stored: string): { keyId: string | null; payload: string } | null {
  const sep = stored.indexOf(':')
  if (sep === -1) return { keyId: null, payload: stored }
  const keyId = stored.slice(0, sep)
  if (!KEY_ID_PATTERN.test(keyId)) return null
  return { keyId, payload: stored.slice(sep + 1) }
}

// The text bound to each value so it only decrypts for its own tenant and key.
function boundData(orgId: string, keyId: string): Uint8Array<ArrayBuffer> {
  // Copied into a fresh array so the type is the same under the Worker and DOM typings.
  return Uint8Array.from(new TextEncoder().encode(`${orgId}|${keyId}`))
}

// Imported CryptoKeys are cached per keyring object, so a warm isolate imports
// each key once.
// (Typed from importKey itself so this file type checks both in the Worker and
// in the Node scripts that import it, where the global CryptoKey type differs.)
type ImportedKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>
const importedKeys = new WeakMap<Keyring, Map<string, Promise<ImportedKey>>>()

function importKey(keyring: Keyring, keyId: string): Promise<ImportedKey> | null {
  const entry = keyring.keys.get(keyId)
  if (!entry) return null
  let perKeyring = importedKeys.get(keyring)
  if (!perKeyring) {
    perKeyring = new Map()
    importedKeys.set(keyring, perKeyring)
  }
  let pending = perKeyring.get(keyId)
  if (!pending) {
    pending = crypto.subtle.importKey('raw', entry.bytes, 'AES-GCM', false, ['encrypt', 'decrypt'])
    perKeyring.set(keyId, pending)
  }
  return pending
}

export async function encryptConnectionString(
  plaintext: string,
  keyring: Keyring,
  orgId: string,
): Promise<string> {
  const keyId = keyring.current
  const key = await importKey(keyring, keyId)
  if (!key) throw new ConnectionStringDecryptError('unknown_key', orgId, keyId)

  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: boundData(orgId, keyId) },
    key,
    new TextEncoder().encode(plaintext),
  )

  const combined = new Uint8Array(iv.length + ciphertext.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(ciphertext), iv.length)

  return `${keyId}:${bytesToBase64(combined)}`
}

export async function decryptConnectionString(
  stored: string,
  keyring: Keyring,
  orgId: string,
): Promise<DecryptResult> {
  const prefix = readKeyPrefix(stored)
  if (!prefix) {
    // Not a legacy value and not a valid prefix. Report the legacy id rather
    // than echoing whatever came before the colon.
    throw new ConnectionStringDecryptError('malformed', orgId, 'unknown')
  }

  const legacy = prefix.keyId === null
  const keyId = prefix.keyId ?? LEGACY_KEY_ID

  const key = await importKey(keyring, keyId)
  if (!key) throw new ConnectionStringDecryptError('unknown_key', orgId, keyId)

  const combined = base64ToBytes(prefix.payload)
  if (!combined || combined.length <= IV_BYTES) {
    throw new ConnectionStringDecryptError('malformed', orgId, keyId)
  }

  const iv = combined.slice(0, IV_BYTES)
  const ciphertext = combined.slice(IV_BYTES)

  try {
    const plaintext = await crypto.subtle.decrypt(
      legacy ? { name: 'AES-GCM', iv } : { name: 'AES-GCM', iv, additionalData: boundData(orgId, keyId) },
      key,
      ciphertext,
    )
    return { plaintext: new TextDecoder().decode(plaintext), keyId, legacy }
  } catch {
    throw new ConnectionStringDecryptError('auth_failed', orgId, keyId)
  }
}

// ── tenant secrets other than the connection string (spec 0004, AC-18) ──────
//
// Same keyring and stored format (`<keyId>:<base64>`), but the bound data also
// names what the value is for, `<orgId>|<purpose>|<keyId>`, so a value copied
// into another column or another tenant fails to decrypt. The connection
// string's own bound data (`<orgId>|<keyId>`) is left unchanged; the extra
// `|purpose|` segment means the two formats can never be confused.

export type SecretPurpose = 'sms_api_token' | 'sms_verify_token'

export class SecretDecryptError extends Error {
  readonly code: DecryptFailureCode
  readonly orgId: string
  readonly purpose: SecretPurpose
  readonly keyId: string

  constructor(code: DecryptFailureCode, orgId: string, purpose: SecretPurpose, keyId: string) {
    super(`Cannot decrypt ${purpose} for org ${orgId} with key ${keyId}: ${code}`)
    this.name = 'SecretDecryptError'
    this.code = code
    this.orgId = orgId
    this.purpose = purpose
    this.keyId = keyId
  }
}

function secretBoundData(orgId: string, purpose: SecretPurpose, keyId: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(new TextEncoder().encode(`${orgId}|${purpose}|${keyId}`))
}

export async function encryptSecret(
  plaintext: string,
  keyring: Keyring,
  orgId: string,
  purpose: SecretPurpose,
): Promise<string> {
  const keyId = keyring.current
  const key = await importKey(keyring, keyId)
  if (!key) throw new SecretDecryptError('unknown_key', orgId, purpose, keyId)

  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: secretBoundData(orgId, purpose, keyId) },
    key,
    new TextEncoder().encode(plaintext),
  )

  const combined = new Uint8Array(iv.length + ciphertext.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(ciphertext), iv.length)

  return `${keyId}:${bytesToBase64(combined)}`
}

// Unlike connection strings there is no legacy (unprefixed) format: these
// values were always written with a key id.
export async function decryptSecret(
  stored: string,
  keyring: Keyring,
  orgId: string,
  purpose: SecretPurpose,
): Promise<{ plaintext: string; keyId: string }> {
  const prefix = readKeyPrefix(stored)
  if (!prefix || prefix.keyId === null) throw new SecretDecryptError('malformed', orgId, purpose, 'unknown')
  const keyId = prefix.keyId

  const key = await importKey(keyring, keyId)
  if (!key) throw new SecretDecryptError('unknown_key', orgId, purpose, keyId)

  const combined = base64ToBytes(prefix.payload)
  if (!combined || combined.length <= IV_BYTES) throw new SecretDecryptError('malformed', orgId, purpose, keyId)

  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: combined.slice(0, IV_BYTES), additionalData: secretBoundData(orgId, purpose, keyId) },
      key,
      combined.slice(IV_BYTES),
    )
    return { plaintext: new TextDecoder().decode(plaintext), keyId }
  } catch {
    throw new SecretDecryptError('auth_failed', orgId, purpose, keyId)
  }
}

// Random URL safe token (base64url, no padding), for the webhook key and the
// webhook verify token.
export function randomUrlToken(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength))
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Compares two strings without returning early on the first difference, so
// the time taken does not reveal how much of a guessed token was right.
export function timingSafeEqualString(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a)
  const right = new TextEncoder().encode(b)
  let diff = left.length ^ right.length
  const length = Math.max(left.length, right.length)
  for (let i = 0; i < length; i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0)
  }
  return diff === 0
}
