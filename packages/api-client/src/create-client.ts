import {hc} from 'hono/client'
import type {Hono} from 'hono'

/**
 * Generic Hono RPC client factory, shared between web and mobile.
 * Callers pass their own AppType as the generic param — this package
 * never imports the Worker directly (apps/web depends on this package,
 * so the reverse import would be circular).
 */
export function createApiClient<AppType extends Hono<any, any, any>>(
    baseUrl: string,
    getToken: () => Promise<string | null>,
    onUnauthorized?: () => void
) {
    return hc<AppType>(baseUrl, {
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
            const token = await getToken()
            const headers = new Headers(init?.headers)
            if (token) headers.set('Authorization', `Bearer ${token}`)
            const response = await fetch(input, {...init, headers})

            // 401 = missing/invalid/expired session token (see clerkAuth() in
            // apps/web/src/worker/middleware/clerk-auth.ts), distinct from 403
            // (valid session, no active org). No platform-specific redirect
            // here — this package is shared with apps/mobile, which has no
            // `window` and its own navigation stack, so each app supplies its
            // own onUnauthorized behavior.
            if (response.status === 401) {
                onUnauthorized?.()
            }

            return response
        },
    })
}