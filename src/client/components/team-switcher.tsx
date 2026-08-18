import { useOrganization } from "@clerk/react"
import {useClerk, useAuth} from "@clerk/react"
import { StrictMode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { ClerkProvider } from "@clerk/react"
import { shadcn } from "@clerk/ui/themes"
import { QueryClientProvider } from "@tanstack/react-query"
import { queryClient } from "@/router.tsx"
import { BrandingSettingsForm } from "@/components/forms/company/branding-settings-form.tsx"
import { PaletteIcon } from "lucide-react"
import { renderToStaticMarkup } from "react-dom/server"

import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

// Clerk's custom page mount/unmount hooks hand back a plain DOM node, not a
// React tree slot — this is a separate React root outside the app's own
// tree, so it needs its own ClerkProvider/QueryClientProvider to give
// BrandingSettingsForm the context (useAuth, useOrganization, useQuery) it
// depends on. Re-wrapping with the same publishable key reuses Clerk's
// already-loaded singleton instance rather than re-initializing it.
let brandingPageRoot: Root | null = null

function mountBrandingPage(el: HTMLDivElement) {
  brandingPageRoot = createRoot(el)
  brandingPageRoot.render(
      <StrictMode>
        <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} appearance={{ theme: shadcn }}>
          <QueryClientProvider client={queryClient}>
            <BrandingSettingsForm />
          </QueryClientProvider>
        </ClerkProvider>
      </StrictMode>,
  )
}

function unmountBrandingPage() {
  brandingPageRoot?.unmount()
  brandingPageRoot = null
}

function mountBrandingIcon(el: HTMLDivElement) {
  el.innerHTML = renderToStaticMarkup(<PaletteIcon className="size-4" />)
}

export function TeamSwitcher() {
  const { organization } = useOrganization()
  const { openOrganizationProfile } = useClerk();
  const { has } = useAuth();
  const isAdmin = has?.({ role: 'org:admin' });

  if (!organization) {
    return null
  }

  return (
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                  onClick={() => isAdmin && openOrganizationProfile({
                    customPages: [
                      {
                        label: "Branding",
                        url: "branding",
                        mountIcon: mountBrandingIcon,
                        mount: mountBrandingPage,
                        unmount: unmountBrandingPage,
                      },
                    ],
                  })}
              >
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <img src={organization.imageUrl} className="rounded-lg size-8 object-cover"  alt="logo"/>
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium font-ubuntu">{organization.name}</span>
                  {/*<span className="truncate text-xs">{organization.name}</span>*/}
                </div>
              </SidebarMenuButton>
            </DropdownMenuTrigger>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
  )
}
