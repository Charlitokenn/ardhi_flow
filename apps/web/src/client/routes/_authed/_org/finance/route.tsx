import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed/_org/finance')({
    staticData: {
        breadcrumb: 'Finance',
        breadcrumbLink: false,
    },
    component: FinanceLayout,
})

function FinanceLayout() {
    return <Outlet />
}