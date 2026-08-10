import { Hono } from 'hono'
import type { Env } from '../types'

const health = new Hono<{ Bindings: Env }>()

health.get('/', (c) => c.json({ ok: true, ts: new Date().toISOString() }))

export default health
