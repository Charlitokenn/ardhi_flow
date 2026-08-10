import { createFileRoute, Outlet, redirect, Link, useRouterState } from '@tanstack/react-router'
import { useState } from 'react'
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
import { OrganizationSwitcher, UserButton } from '@clerk/react'
import { LandPlot, LayoutDashboard, Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { ModeToggle } from '@/components/mode-toggle'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/_authed/_org')({
  beforeLoad: ({ context }) => {
    if (!context.auth.orgId) {
      throw redirect({ to: '/onboarding' })
    }
  },
  component: OrgLayout,
})

const navItems = [
  { to: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { to: '/dashboard/plots', label: 'Plots', icon: LandPlot },
] as const

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




function TopBar() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3 md:justify-end">
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetTrigger asChild className="md:hidden">
          <Button variant="ghost" size="icon">
            <Menu />
            <span className="sr-only">Open navigation</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarNav onNavigate={() => setMobileNavOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="md:hidden">
        <ArdhiFlowMark />
      </div>
      <div className="ml-auto flex items-center gap-2">
        <ModeToggle />
        <UserButton />
      </div>
    </header>
  )
}

function SidebarNav({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  return (
    <aside
      className={cn(
        'flex w-64 shrink-0 flex-col gap-4 border-r border-sidebar-border bg-sidebar p-4 text-sidebar-foreground',
        className,
      )}
    >
      <div className="hidden md:block">
        <ArdhiFlowMark />
      </div>

      <OrganizationSwitcher hidePersonal />

      <nav className="flex flex-col gap-0.5">
        {navItems.map((item) => {
          const isActive = pathname === item.to
          const Icon = item.icon
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}

// ArdhiFlow means "land flow" — the mark is a plot boundary closing into
// itself, standing in for the survey-plan/ledger register the app manages.
function ArdhiFlowMark() {
  return (
    <div className="flex items-center gap-2 px-1">
      <svg viewBox="0 0 24 24" className="size-5 text-primary" aria-hidden="true">
        <path
          d="M4 8 L11 4 L20 7 L18 17 L7 20 L4 15 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <circle cx="4" cy="8" r="1.3" fill="currentColor" />
        <circle cx="11" cy="4" r="1.3" fill="currentColor" />
        <circle cx="20" cy="7" r="1.3" fill="currentColor" />
        <circle cx="18" cy="17" r="1.3" fill="currentColor" />
        <circle cx="7" cy="20" r="1.3" fill="currentColor" />
        <circle cx="4" cy="15" r="1.3" fill="currentColor" />
      </svg>
      <span className="text-sm font-semibold tracking-tight">ArdhiFlow</span>
    </div>
  )
}
