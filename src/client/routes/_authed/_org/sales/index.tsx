import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed/_org/sales/')({
    staticData: {
        breadcrumb: 'Sales',
    },
    component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_authed/_org/sales/sales"!</div>
}
