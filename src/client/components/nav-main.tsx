import * as React from "react"
import {Link, useLocation} from "@tanstack/react-router"
import {Collapsible, CollapsibleContent, CollapsibleTrigger,} from "@/components/ui/collapsible"
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
import {ChevronRightIcon} from "lucide-react"

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
        item.items?.some(
            (subItem) =>
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

                    // Regular menu item without children
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
                                        tooltip={{
                                            children: (
                                                <div className="flex min-w-42.5 flex-col gap-1.5">
                                                    <div
                                                        className="mb-1 border-b border-background/20 pb-1.5 text-sm font-semibold">
                                                        {item.title}
                                                    </div>

                                                    {item.items?.map((subItem) => {
                                                        const isActive =
                                                            location.pathname === subItem.url ||
                                                            location.pathname.startsWith(
                                                                subItem.url + "/"
                                                            )

                                                        return (
                                                            <Link
                                                                key={subItem.title}
                                                                to={subItem.url}
                                                                className={[
                                                                    "block rounded-sm px-2 py-1.5 text-xs transition-colors",
                                                                    "hover:bg-background/10",
                                                                    isActive
                                                                        ? "bg-background/15 font-medium"
                                                                        : "",
                                                                ].join(" ")}
                                                            >
                                                                {subItem.title}
                                                            </Link>
                                                        )
                                                    })}
                                                </div>
                                            ),
                                            className:
                                                "pointer-events-auto p-2 text-background",
                                            sideOffset: 6,
                                        }}
                                        className="group-data-[state=open]/collapsible:bg-accent group-data-[state=open]/collapsible:text-accent-foreground"
                                    >
                                        {item.icon}
                                        <span>{item.title}</span>

                                        <ChevronRightIcon
                                            className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"/>
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
                                                            className:
                                                                "bg-accent text-accent-foreground",
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