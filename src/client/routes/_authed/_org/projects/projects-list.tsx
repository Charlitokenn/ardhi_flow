import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed/_org/projects/projects-list')({
    staticData: {
        breadcrumb: 'Projects List',
    },
    component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_authed/_org/projects/projects"!</div>
}
