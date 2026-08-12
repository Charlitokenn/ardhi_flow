import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed/_org/finance/')({
  staticData: {
    breadcrumb: 'Finance',
  },
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_authed/_org/finance/"!</div>
}
