import { createFileRoute } from '@tanstack/react-router'
import {PageHero} from "@/components/pageHero.tsx";
import {WalletIcon} from "lucide-react";
import {TransactionsDataGrid} from "@/components/data-grids/transactions-datagrid.tsx";

export const Route = createFileRoute('/_authed/_org/finance/transactions')({
  staticData: {
    breadcrumb: 'Transactions',
  },
  component: RouteComponent,
})

function RouteComponent() {
  return (
      <section className="-mt-4 -ml-1">
        <PageHero
            type="hero"
            title="Transactions"
            subtitle="Manage all transactions here"
            showButton={true}
            buttonText="Record Transaction"
            buttonIcon={<WalletIcon/>}
        />
        <TransactionsDataGrid/>
      </section>
  )
}
