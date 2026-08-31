import { neon } from '@neondatabase/serverless'
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http'
import * as schema from '../../../drizzle/catalog/schema'

// neon-http has no persistent connection to pool or close — each query is
// just an HTTPS fetch — so "caching" this only saves re-creating the tiny
// wrapper object across requests within the same warm isolate. Harmless if
// it gets re-created on a cold start.
let cached: NeonHttpDatabase<typeof schema> | null = null

export function getCatalogDb(connectionString: string): NeonHttpDatabase<typeof schema> {
  if (!cached) {
    cached = drizzle(neon(connectionString), { schema })
  }
  return cached
}
