import { Hono } from 'hono'
import type { Env } from '../types'

const health = new Hono<{ Bindings: Env }>()

health.get('/', (ctx) => ctx.json({ ok: true, timestamp: new Date().toISOString() }))

export default health
