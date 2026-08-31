import { StrictMode, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { ClerkProvider, useAuth } from '@clerk/react'
import { shadcn } from '@clerk/ui/themes'
import { RouterProvider } from '@tanstack/react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { router, queryClient } from './router'
import {TooltipProvider} from "@/components/ui/tooltip.tsx";
import {Toaster} from "sonner";
import Loader from "@/components/loader.tsx";

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!CLERK_PUBLISHABLE_KEY) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY — set it in .env')
}

function InnerApp() {
  const auth = useAuth()
  const wasSignedIn = useRef(false)

  // beforeLoad guards (see routes/_authed/route.tsx) only rerun on
  // navigation, not just because the `context` prop below changed. Without
  // this, a session that dies while the user sits idle on an authed page
  // (inactivity timeout, revoked elsewhere, max session age) leaves them
  // stranded there until their next click. Only fires on the true->false
  // transition, not on the initial unauthenticated render.
  useEffect(() => {
    if (!auth.isLoaded) return
    if (wasSignedIn.current && !auth.isSignedIn) {
      router.invalidate()
    }
    wasSignedIn.current = auth.isSignedIn
  }, [auth.isLoaded, auth.isSignedIn])

  // Wait for Clerk before mounting the router at all, so every route's
  // beforeLoad sees a resolved isSignedIn/orgId rather than a mid-load
  // undefined state. Simpler than threading a loading check through every
  // guard individually.
  if (!auth.isLoaded) {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
          <Loader />
      </div>
    )
  }

  return (
    <RouterProvider
      router={router}
      context={{
        auth: { isSignedIn: auth.isSignedIn, orgId: auth.orgId, getToken: auth.getToken },
      }}
    />
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      appearance={{
        options: {
          socialButtonsPlacement: 'bottom',
          socialButtonsVariant: 'iconButton',
          logoLinkUrl: '/',
            logoImageUrl: '/logo-alt.svg',
          logoPlacement: 'inside',
        },
        theme: shadcn,
      }}
    >
        <TooltipProvider>
          <QueryClientProvider client={queryClient}>
            <InnerApp />
              <Toaster />
          </QueryClientProvider>
        </TooltipProvider>
    </ClerkProvider>
  </StrictMode>,
)
