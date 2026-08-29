import {createMiddleware} from 'hono/factory'
import {verifyToken} from '@clerk/backend'
import type {Env, Variables} from '../types'

// Shared by clerkAuth() below and verifyPresenceConnection() in
// durable-objects/tenant-presence.ts — both need the exact same
// verifyToken({ secretKey, jwtKey }) call against a Clerk session token,
// they just differ in what they do with the resulting claims afterward
// (clerkAuth requires an org_id at all; the presence guard requires it to
// match a specific room).
export function verifyClerkToken(token: string, env: Pick<Env, 'CLERK_SECRET_KEY' | 'CLERK_JWT_KEY'>) {
    return verifyToken(token, {
        secretKey: env.CLERK_SECRET_KEY,
        jwtKey: env.CLERK_JWT_KEY,
    })
}

// Verifies locally against Clerk's JWT public key (no network round trip to
// Clerk per request) — pass `jwtKey`, not just `secretKey`. Clerk's own docs
// call this out specifically for V8 isolate runtimes (Cloudflare Workers,
// Vercel Edge): without it, verifyToken() falls back to fetching the JWKS
// over the network on cache misses, which defeats the point of verifying at
// the edge. Get the key from Clerk dashboard → API Keys → Advanced → JWT
// public key, store it as the CLERK_JWT_KEY secret. Requires the frontend
// to send the Clerk session token as `Authorization: Bearer <token>` — get
// it with `await getToken()` from `useAuth()` and attach it in your API
// client / Hono RPC fetch wrapper.
//
// org_id / org_role only show up in the token if you've added them to your
// session token's custom claims in the Clerk dashboard (Sessions → Edit →
// Customize session token):
//   { "org_id": "{{org.id}}", "org_role": "{{org.role}}", "org_slug": "{{org.slug}}" }
// Without that, every request here will 403 as "No active organization"
// even for a signed-in user, since Clerk supports personal accounts too.
export const clerkAuth = () =>
    createMiddleware<{ Bindings: Env; Variables: Variables }>(async (c, next) => {
        const token = c.req.header('Authorization')?.replace('Bearer ', '')

        if (!token) {
            return c.json({error: 'Missing session token'}, 401)
        }

        try {
            const claims = await verifyToken(token, {
                secretKey: c.env.CLERK_SECRET_KEY,
                jwtKey: c.env.CLERK_JWT_KEY,
            })

            const orgId = claims.org_id as string | undefined
            if (!orgId) {
                return c.json({error: 'No active organization'}, 403)
            }

            c.set('userId', claims.sub)
            c.set('orgId', orgId)
            c.set('orgRole', (claims.org_role as string | undefined) ?? '')
        } catch {
            return c.json({error: 'Invalid or expired session token'}, 401)
        }

        await next()
    })