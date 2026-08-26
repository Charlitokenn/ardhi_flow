import {createFileRoute} from '@tanstack/react-router'
import {PageHero} from "@/components/pageHero.tsx";
import {ShoppingCartIcon} from "lucide-react";
import {ContractsDataGrid} from "@/components/data-grids/contracts-datagrid.tsx";
import Page from "@/components/forms/FormWizard.tsx";

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
                showButton={true}
                buttonText="New Contract"
                hideSheetHeader
                hideSheetFooter
                sheetContent={<Page/>}
                buttonIcon={<ShoppingCartIcon/>}
                showBulkUploader={true}
            />
            <ContractsDataGrid/>
        </section>
    )
}
