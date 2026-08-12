import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed/_org/finance/transactions')({
  staticData: {
    breadcrumb: 'Transactions',
  },
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_authed/_org/finance/transactions"!</div>
}
