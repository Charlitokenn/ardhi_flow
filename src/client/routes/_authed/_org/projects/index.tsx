import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed/_org/projects/')({
  staticData: {
    breadcrumb: 'Projects',
  },
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_authed/_org/projects/"!</div>
}
