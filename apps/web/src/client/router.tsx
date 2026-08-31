import { createRouter } from '@tanstack/react-router'
import { QueryClient } from '@tanstack/react-query'
import { routeTree } from './routeTree.gen'

// Bridges Clerk's `useAuth()` into route `beforeLoad` context. Populated at
// render time in main.tsx — see the comment there for why isLoaded is
// resolved *before* the router ever mounts, rather than handled inside
// individual beforeLoad functions.
export interface RouterAuthContext {
  isSignedIn: boolean
  orgId: string | null | undefined
  getToken: () => Promise<string | null>
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000 },
  },
})

export const router = createRouter({
  routeTree,
  context: {
    // Real value supplied via the `context` prop on <RouterProvider>, once
    // Clerk has loaded — see main.tsx. This placeholder only satisfies the
    // type until then.
    auth: undefined as unknown as RouterAuthContext,
    queryClient,
  },
  defaultPreload: 'intent',
  scrollRestoration: true,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
