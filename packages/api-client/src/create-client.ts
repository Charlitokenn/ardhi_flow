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
    getToken: () => Promise<string | null>
) {
    return hc<AppType>(baseUrl, {
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
            const token = await getToken()
            const headers = new Headers(init?.headers)
            if (token) headers.set('Authorization', `Bearer ${token}`)
            return fetch(input, {...init, headers})
        },
    })
}