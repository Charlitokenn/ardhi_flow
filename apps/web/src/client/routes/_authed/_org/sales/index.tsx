import {createFileRoute} from '@tanstack/react-router'
import {PageHero} from "@/components/pageHero.tsx";
import {ContractsDataGrid} from "@/components/data-grids/contracts-datagrid.tsx";

export const Route = createFileRoute('/_authed/_org/sales/')({
    staticData: {
        breadcrumb: 'Sales',
    },
    component: RouteComponent,
})

function RouteComponent() {
    return (
        <section className="-mt-4 -ml-1">
            <PageHero
                type="hero"
                title="Sales"
                subtitle="Manage all sales contracts"
            />
            <ContractsDataGrid/>
        </section>
    )
}
