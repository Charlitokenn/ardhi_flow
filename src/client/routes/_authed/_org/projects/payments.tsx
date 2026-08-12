import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed/_org/projects/payments')({
    staticData: {
        breadcrumb: 'Plots',
    },
    component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_authed/_org/projects/payments"!</div>
}
