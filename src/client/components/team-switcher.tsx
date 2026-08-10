import { useOrganization } from "@clerk/react"
import {useClerk, useAuth} from "@clerk/react"

import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

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
                  onClick={() => isAdmin && openOrganizationProfile()}
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
