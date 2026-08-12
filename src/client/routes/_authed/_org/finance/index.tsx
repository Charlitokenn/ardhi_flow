import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed/_org/finance/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_authed/_org/finance/"!</div>
}
