import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed/_org/messaging/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_authed/_org/messaging/"!</div>
}
