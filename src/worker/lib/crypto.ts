// Tenant Neon connection strings carry a real Postgres password, so they're
// encrypted before being written to the catalog DB — never stored plaintext.
//
// TENANT_CONN_ENCRYPTION_KEY is a base64-encoded 256-bit key, generated once
// with e.g. `openssl rand -base64 32` and stored as a Workers secret. Losing
// this key means losing access to every tenant connection string, so back it
// up somewhere durable outside Cloudflare too.

async function importKey(base64Key: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(base64Key), (c) => c.charCodeAt(0))
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function encryptConnectionString(plaintext: string, base64Key: string): Promise<string> {
  const key = await importKey(base64Key)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext))

  const combined = new Uint8Array(iv.length + ciphertext.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(ciphertext), iv.length)

  return btoa(String.fromCharCode(...combined))
}

export async function decryptConnectionString(encoded: string, base64Key: string): Promise<string> {
  const key = await importKey(base64Key)
  const combined = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))
  const iv = combined.slice(0, 12)
  const ciphertext = combined.slice(12)

  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  return new TextDecoder().decode(plaintext)
}
