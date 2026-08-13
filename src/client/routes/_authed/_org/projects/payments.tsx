import { createFileRoute } from '@tanstack/react-router'
import {PageHero} from "@/components/pageHero.tsx";
import {BanknoteArrowUpIcon} from "lucide-react";

export const Route = createFileRoute('/_authed/_org/projects/payments')({
    staticData: {
        breadcrumb: 'Payments',
    },
    component: RouteComponent,
})

function RouteComponent() {
    return (
        <section className="-mt-4 -ml-1">
            <PageHero
                type="hero"
                title="Payments"
                subtitle="Manage project payments"
                showButton={true}
                buttonText="Record Payment"
                buttonIcon={<BanknoteArrowUpIcon/>}
            />
        </section>
    )
}
