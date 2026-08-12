import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed/_org/finance')({
    component: FinanceLayout,
})

function FinanceLayout() {
    return <Outlet />
}