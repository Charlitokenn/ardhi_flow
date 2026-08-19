import {createFileRoute} from '@tanstack/react-router'
import {PageHero} from "@/components/pageHero.tsx";
import {CalendarSyncIcon} from "lucide-react";

export const Route = createFileRoute('/_authed/_org/finance/commissions')({
    staticData: {
        breadcrumb: 'Commissions',
    },
    component: RouteComponent,
})

function RouteComponent() {
    return (
        <section className="-mt-4 -ml-1">
            <PageHero
                type="hero"
                title="Commissions"
                subtitle="Manage all commissions here"
                showButton={true}
                buttonText="Pay Commission"
                buttonIcon={<CalendarSyncIcon/>}
            />
        </section>
    )
}
