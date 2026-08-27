import {createFileRoute} from '@tanstack/react-router'
import {PageHero} from "@/components/pageHero.tsx";
import {BellRingIcon} from "lucide-react";
import {InstallmentsReminderDataGrid} from "@/components/data-grids/installments-reminder-datagrid.tsx";

export const Route = createFileRoute('/_authed/_org/finance/reminder')({
    staticData: {
        breadcrumb: 'Reminder',
    },
    component: RouteComponent,
})

function RouteComponent() {
    return (
        <section className="-mt-4 -ml-1">
            <PageHero
                type="hero"
                title="Reminder"
                subtitle="Followup on outstanding payments"
                buttonIcon={<BellRingIcon/>}
            />
            <InstallmentsReminderDataGrid/>
        </section>
    )
}
