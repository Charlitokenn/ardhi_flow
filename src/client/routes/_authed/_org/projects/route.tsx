import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed/_org/projects')({
    staticData: {
        breadcrumb: 'Projects',
        breadcrumbLink: false,
    },
    component: Layout,
})

function Layout() {
    return <Outlet />
}