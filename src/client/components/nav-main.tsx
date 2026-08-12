import * as React from "react"
import {Link, useLocation } from "@tanstack/react-router"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import { ChevronRightIcon } from "lucide-react"

export function NavMain({
                          items,
                        }: {
  items: {
    title: string
    url: string
    icon?: React.ReactNode
    items?: {
      title: string
      url: string
    }[]
  }[]
}) {
  const location = useLocation()

  const activeParent = items.find((item) =>
      item.items?.some((subItem) =>
          location.pathname === subItem.url ||
          location.pathname.startsWith(subItem.url + "/")
      )
  )

  const [openItem, setOpenItem] = React.useState<string | null>(
      activeParent?.title ?? null
  )

  return (
      <SidebarGroup>
        <SidebarGroupLabel>Platform</SidebarGroupLabel>
        <SidebarMenu>
          {items.map((item) => {
            const hasSubItems = !!item.items?.length

            // No subitems — a plain, directly-clickable link. No caret and
            // no Collapsible wrapper, since there's nothing to expand.
            if (!hasSubItems) {
              return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                        asChild
                        tooltip={item.title}
                    >
                      <Link
                          to={item.url}
                          activeProps={{
                            className: "bg-accent text-accent-foreground",
                          }}
                      >
                        {item.icon}
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
              )
            }

            return (
                <Collapsible
                    key={item.title}
                    asChild
                    open={openItem === item.title}
                    onOpenChange={(isOpen) => {
                      setOpenItem(isOpen ? item.title : null)
                    }}
                    className="group/collapsible"
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                          tooltip={item.title}
                          className="group-data-[state=open]/collapsible:bg-accent group-data-[state=open]/collapsible:text-accent-foreground"
                      >
                        {item.icon}
                        <span>{item.title}</span>

                        <ChevronRightIcon className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {item.items?.map((subItem) => (
                            <SidebarMenuSubItem key={subItem.title}>
                              <SidebarMenuSubButton asChild>
                                <Link
                                    to={subItem.url}
                                    activeProps={{
                                      className: "bg-accent text-accent-foreground",
                                    }}
                                >
                                  <span>{subItem.title}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
            )
          })}
        </SidebarMenu>
      </SidebarGroup>
  )
}