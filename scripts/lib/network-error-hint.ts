// Shared by the CLI scripts that talk to Neon over its HTTP driver
// (`@neondatabase/serverless` + drizzle-orm/neon-http) — currently
// scripts/migrate-tenants.ts and scripts/seed-tenant.ts. Node's built-in
// fetch (undici) can fail with `TypeError: fetch failed` on networks where
// IPv6 is advertised but not actually routable, or where something in the
// network path otherwise interferes with fetch/undici specifically even
// though raw TCP/TLS connectivity to Neon works fine (e.g. `curl -4 -sv
// https://<your-neon-host>` succeeds). Each affected script already forces
// IPv4-first DNS resolution, but that alone doesn't fix every network — the
// definitive fix is to bypass fetch entirely via the `-pg` variant of the
// same script (plain Postgres wire protocol instead of HTTP), so this helper
// detects the failure and points the user at it instead of leaving them to
// dig through source comments.
export function isFetchNetworkError(err: unknown): boolean {
  let current: unknown = err
  for (let i = 0; i < 8 && current; i++) {
    if (!(current instanceof Error)) break
    if (current.name === 'TypeError' && current.message === 'fetch failed') return true
    // Drizzle wraps the driver error as `.cause`; Neon's own error (thrown
    // by @neondatabase/serverless) additionally nests the actual fetch
    // TypeError under `.sourceError` rather than `.cause` — walk both.
    current = (current as { cause?: unknown; sourceError?: unknown }).cause
      ?? (current as { sourceError?: unknown }).sourceError
  }
  return false
}

export function printFetchNetworkErrorHint(pgScriptName: string): void {
  console.error(
    `\n💡 This looks like Node's fetch (undici) failing to reach Neon over HTTPS — common on networks\n` +
      `   where IPv6 is advertised but not actually routable, even with IPv4-first DNS resolution\n` +
      `   already forced. Try the Postgres-wire-protocol variant instead, which bypasses fetch/undici\n` +
      `   entirely:\n\n` +
      `     npm run ${pgScriptName}\n`,
  )
}
