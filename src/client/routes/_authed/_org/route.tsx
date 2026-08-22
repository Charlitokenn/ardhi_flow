import * as React from 'react'
import {createFileRoute, Link, Outlet, redirect, useMatches} from '@tanstack/react-router'
import {AppSidebar} from "@/components/app-sidebar"
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import {Separator} from "@/components/ui/separator"
import {SidebarInset, SidebarProvider, SidebarTrigger,} from "@/components/ui/sidebar"
import {UserButton} from '@clerk/react'
import {ModeToggle} from '@/components/mode-toggle'
import {NetworkStatusBanner} from "@/components/network-status-banner.tsx";
import {QuickActionsMenu} from "@/components-reusable/reusable-quick-actions.tsx";
import {apiClient} from "@/lib/api.ts"
import {LabelNumberTicker} from "@/components/number-ticker/number-ticker-05.tsx";

export const Route = createFileRoute('/_authed/_org')({
    beforeLoad: ({context}) => {
        if (!context.auth.orgId) {
            throw redirect({to: '/onboarding'})
        }
    },
    // Prefetches the tenant's `company_settings` row once per entry into the
    // org area, into the same React Query cache (`context.queryClient` is
    // the same singleton `main.tsx` wraps in <QueryClientProvider>) that
    // TeamSwitcher and BrandingSettingsForm already read via
    // useQuery(["company-settings"]) — neither needs to change: they'll see
    // this data already cached instead of firing their own request.
    // prefetchQuery (not ensureQueryData) so this doesn't block route entry —
    // a slow or failed settings fetch shouldn't hold up the whole org area
    // for what's ultimately a cosmetic sidebar slogan. Also no-ops if a
    // still-fresh entry already exists (per the global 30s staleTime in
    // router.tsx), so re-entering this route doesn't refire it every time.
    loader: ({context}) => {
        const api = apiClient(context.auth.getToken)
        void context.queryClient.prefetchQuery({
            queryKey: ['company-settings'],
            queryFn: async () => {
                const res = await api.api['company-settings'].$get()
                if (!res.ok) throw new Error(`Failed to load company settings (${res.status})`)
                return res.json()
            },
        })
    },
    component: OrgLayout,
})

function OrgLayout() {
    const matches = useMatches()

    const breadcrumbs = matches
        .filter((match) => match.staticData?.breadcrumb)
        .map((match) => ({
            label: match.staticData.breadcrumb,
            path: match.pathname,
            link: match.staticData.breadcrumbLink !== false,
        }))

    return (
        <SidebarProvider className="h-dvh">
            <AppSidebar/>

            <SidebarInset>
                <NetworkStatusBanner/>
                <header
                    className="flex border-b shrink-0 items-center py-2 gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
                    <div className="flex font-sans items-center gap-2 px-4">
                        <SidebarTrigger className="-ml-1"/>

                        <Separator
                            orientation="vertical"
                            className="mr-2 self-center"
                        />

                        <Breadcrumb>
                            <BreadcrumbList>
                                {breadcrumbs.map((crumb, index) => {
                                    const isLast = index === breadcrumbs.length - 1

                                    return (
                                        <React.Fragment key={crumb.path}>
                                            {index > 0 && (
                                                <BreadcrumbSeparator className="hidden md:block"/>
                                            )}

                                            <BreadcrumbItem
                                                className={index === 0 ? "hidden md:block" : ""}
                                            >
                                                {isLast || !crumb.link ? (
                                                    <BreadcrumbPage>
                                                        {crumb.label}
                                                    </BreadcrumbPage>
                                                ) : (
                                                    <BreadcrumbLink asChild>
                                                        <Link to={crumb.path}>
                                                            {crumb.label}
                                                        </Link>
                                                    </BreadcrumbLink>
                                                )}
                                            </BreadcrumbItem>
                                        </React.Fragment>
                                    )
                                })}
                            </BreadcrumbList>
                        </Breadcrumb>
                    </div>

                    <div className="ml-auto flex items-center gap-3 mr-6">
                        <LabelNumberTicker value={98780} label="SMS" className="text-xs"/>
                        <QuickActionsMenu/>
                        <ModeToggle/>
                        <UserButton/>
                    </div>
                </header>

                <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-6">
                    <Outlet/>
                </main>
            </SidebarInset>
        </SidebarProvider>
    )
}