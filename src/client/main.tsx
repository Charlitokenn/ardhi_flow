import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { ClerkProvider, useAuth } from '@clerk/react'
import { shadcn } from '@clerk/ui/themes'
import { RouterProvider } from '@tanstack/react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { router, queryClient } from './router'
import {TooltipProvider} from "@/components/ui/tooltip.tsx";

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!CLERK_PUBLISHABLE_KEY) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY — set it in .env')
}

function InnerApp() {
  const auth = useAuth()

  // Wait for Clerk before mounting the router at all, so every route's
  // beforeLoad sees a resolved isSignedIn/orgId rather than a mid-load
  // undefined state. Simpler than threading a loading check through every
  // guard individually.
  if (!auth.isLoaded) {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        Loading…
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
          logoPlacement: 'inside',
        },
        theme: shadcn,
      }}
    >
        <TooltipProvider>
          <QueryClientProvider client={queryClient}>
            <InnerApp />
          </QueryClientProvider>
        </TooltipProvider>
    </ClerkProvider>
  </StrictMode>,
)
