// A Neon HTTP client that survives a tenant password change (spec 0003, AC-10).
//
// After an emergency key rotation (`rotate:keys --emergency`) every tenant's
// database password changes, but the tenant resolver may still hold the old
// connection string in KV for up to 5 minutes. A query then fails with a
// database authentication error. When that happens this client, at most once
// per request:
//
//   1. asks `refresh()` for a fresh connection string (the resolver deletes the
//      cached copy, re-reads and decrypts the catalog value, and writes the
//      fresh value back to the cache),
//   2. replays the same query, or the same batch, on a client built from it.
//
// A rejected password means no statement ran, so replaying is safe for single
// queries and for batched transactions. Any other error is returned untouched,
// and a failure on the replay is returned normally, so there is no loop.
//
// How it plugs into Drizzle: `drizzle-orm/neon-http` only needs two members of
// the Neon client, `query(text, params, opts)` (it awaits the result) and
// `transaction(queries, opts)` (its `db.batch()`). Both are implemented here.
// A Drizzle upgrade could change that contract, so re-run the emergency drill
// after upgrading drizzle-orm or @neondatabase/serverless (see the runbook).

import { neon } from '@neondatabase/serverless'
import type { HTTPQueryOptions, HTTPTransactionOptions, NeonQueryFunction } from '@neondatabase/serverless'

type Client = NeonQueryFunction<false, false>
// Typed like the client Drizzle is handed (array and full result modes off).
// Drizzle may pass `arrayMode: true` per query at runtime; those options are
// handed straight through to Neon unchanged.
type QueryOptions = HTTPQueryOptions<false, false>
type TransactionOptions = HTTPTransactionOptions<false, false>

// Run `exec` on the current client and, on a database authentication error,
// once more on the refreshed client.
type Runner = <T>(exec: (client: Client) => PromiseLike<T>) => Promise<T>

// Postgres SQLSTATE codes for a rejected login: 28P01 invalid_password,
// 28000 invalid_authorization_specification.
//
// TODO(spec 0003 follow up): confirm during the emergency drill the exact
// code Neon's HTTP endpoint returns for a rejected password, then keep only
// the code(s) that actually appear.
const AUTH_ERROR_CODES: ReadonlySet<string> = new Set(['28P01', '28000'])
const AUTH_ERROR_MESSAGE = /password authentication failed/i

function readProperty(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined
}

// Neon's own error nests the failed fetch under `sourceError`, and Drizzle
// wraps driver errors as `cause`, so walk both.
export function isDatabaseAuthError(err: unknown): boolean {
  let current: unknown = err
  for (let depth = 0; depth < 8 && current instanceof Error; depth++) {
    const code = readProperty(current, 'code')
    if (typeof code === 'string' && AUTH_ERROR_CODES.has(code)) return true
    if (AUTH_ERROR_MESSAGE.test(current.message)) return true
    current = readProperty(current, 'cause') ?? readProperty(current, 'sourceError')
  }
  return false
}

// What `client.query()` hands back. Like Neon's own query promise it is lazy:
// nothing is sent until it is awaited (or passed to `transaction()`), and each
// `then` runs the query again.
class RetryingQuery implements PromiseLike<unknown> {
  readonly text: string
  readonly params: unknown[]
  readonly options: QueryOptions | undefined
  private readonly run: Runner

  constructor(run: Runner, text: string, params: unknown[], options: QueryOptions | undefined) {
    this.run = run
    this.text = text
    this.params = params
    this.options = options
  }

  private execute(): Promise<unknown> {
    return this.run((client) => client.query(this.text, this.params, this.options))
  }

  then<R1 = unknown, R2 = never>(
    onFulfilled?: ((value: unknown) => R1 | PromiseLike<R1>) | null,
    onRejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    return this.execute().then(onFulfilled, onRejected)
  }

  catch<R = never>(onRejected?: ((reason: unknown) => R | PromiseLike<R>) | null): Promise<unknown> {
    return this.execute().catch(onRejected)
  }

  finally(onFinally?: (() => void) | null): Promise<unknown> {
    return this.execute().finally(onFinally)
  }
}

function isRetryingQueryList(value: unknown): value is RetryingQuery[] {
  return Array.isArray(value) && value.every((item) => item instanceof RetryingQuery)
}

/**
 * @param connectionString The tenant connection string the request starts with.
 * @param refresh Returns a fresh connection string, or null when none can be
 *   found. Called at most once. If it throws, the original error is returned.
 */
export function createResilientNeon(
  connectionString: string,
  refresh: () => Promise<string | null>,
): Client {
  const initial = neon(connectionString)
  let current: Client = initial
  let refreshing: Promise<Client | null> | null = null

  // One refresh per request, shared by queries that fail at the same moment
  // (for example inside Promise.all).
  const refreshOnce = (): Promise<Client | null> => {
    refreshing ??= refresh().then(
      (fresh) => {
        if (!fresh) return null
        current = neon(fresh)
        return current
      },
      (err: unknown) => {
        // Name only: an error message could carry a connection string.
        console.error(`[tenant-resolver] connection refresh failed: ${err instanceof Error ? err.name : 'error'}`)
        return null
      },
    )
    return refreshing
  }

  const run: Runner = async (exec) => {
    const used = current
    try {
      return await exec(used)
    } catch (err) {
      // Only a failure on the original client is retried. A failure on the
      // refreshed client is the "second failure" and goes back as it is.
      if (used !== initial || !isDatabaseAuthError(err)) throw err
      const fresh = await refreshOnce()
      if (!fresh) throw err
      return await exec(fresh)
    }
  }

  const query = (text: string, params?: unknown[], options?: QueryOptions): RetryingQuery =>
    new RetryingQuery(run, text, params ?? [], options)

  const transaction = (queries: unknown, options?: TransactionOptions): Promise<unknown> => {
    if (!isRetryingQueryList(queries)) {
      throw new Error('Tenant client transactions accept an array of queries created by this client.')
    }
    // Rebuild the queries on whichever client runs the batch, so a retry sends
    // the same statements to the refreshed connection.
    return run((client) =>
      client.transaction(queries.map((q) => client.query(q.text, q.params, q.options)), options),
    )
  }

  const unsafe = (): never => {
    throw new Error('sql.unsafe() is not supported on the tenant client.')
  }

  const direct = (): never => {
    throw new Error('Call the tenant client through Drizzle, or use client.query().')
  }

  // Drizzle's neon-http driver is typed against NeonQueryFunction but only uses
  // `query` and `transaction`. This is the one place that contract is faked.
  return Object.assign(direct, { query, transaction, unsafe }) as unknown as Client
}
