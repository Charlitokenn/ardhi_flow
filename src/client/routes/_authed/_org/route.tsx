import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { AppSidebar } from "@/components/app-sidebar"
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import {
    SidebarInset,
    SidebarProvider,
    SidebarTrigger,
} from "@/components/ui/sidebar"
import { UserButton } from '@clerk/react'
import { ModeToggle } from '@/components/mode-toggle'

export const Route = createFileRoute('/_authed/_org')({
    beforeLoad: ({ context }) => {
        if (!context.auth.orgId) {
            throw redirect({ to: '/onboarding' })
        }
    },
    component: OrgLayout,
})

function OrgLayout() {
    return (
        <SidebarProvider>
            <AppSidebar />
            <SidebarInset>
                <header className="flex shrink-0 items-center py-2 gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
                    <div className="flex font-sans items-center gap-2 px-4">
                        <SidebarTrigger className="-ml-1" />
                        <Separator
                            orientation="vertical"
                            className="mr-2 data-[orientation=vertical]:h-4"
                        />
                        <Breadcrumb>
                            <BreadcrumbList>
                                <BreadcrumbItem className="hidden md:block">
                                    <BreadcrumbLink href="#">
                                        Build Your Application
                                    </BreadcrumbLink>
                                </BreadcrumbItem>
                                <BreadcrumbSeparator className="hidden md:block" />
                                <BreadcrumbItem>
                                    <BreadcrumbPage>Data Fetching</BreadcrumbPage>
                                </BreadcrumbItem>
                            </BreadcrumbList>
                        </Breadcrumb>
                    </div>
                    <div className="ml-auto flex items-center gap-3 mr-6">
                        <ModeToggle />
                        <UserButton />
                    </div>
                </header>
                <main className="flex-1 overflow-y-auto p-6">
                    <Outlet />
                </main>
            </SidebarInset>
        </SidebarProvider>
    )
}