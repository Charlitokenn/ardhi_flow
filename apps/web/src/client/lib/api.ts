import { hc } from 'hono/client'
// Type-only import — erased at compile time (verbatimModuleSyntax), so none
// of the Worker's runtime code (Drizzle, Neon, Clerk backend SDK, etc.) ever
// makes it into the client bundle. Only the route *shape* is shared.
import type { AppType } from '../../worker'

// Same-origin in production (the Worker serves both the API and the built
// assets). In dev, @cloudflare/vite-plugin proxies /api/* to the Worker
// running inside Vite's dev server, so this still works unmodified.

export function apiClient(getToken: () => Promise<string | null>) {
  return hc<AppType>('/', {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const token = await getToken()
      const headers = new Headers(init?.headers)
      if (token) headers.set('Authorization', `Bearer ${token}`)
      const response = await fetch(input, { ...init, headers })

      // 401 specifically means the session token was missing/invalid/expired
      // (see clerkAuth() in worker/middleware/clerk-auth.ts) — distinct from
      // 403, which means a valid session with no active org. A hard redirect
      // (not router.navigate) is deliberate: it forces ClerkProvider and the
      // TanStack Query cache to remount clean rather than carrying over any
      // in-memory state from the dead session.
      if (response.status === 401) {
        window.location.href = '/sign-in'
      }

      return response
    },
  })
}

export type ApiClient = ReturnType<typeof apiClient>
