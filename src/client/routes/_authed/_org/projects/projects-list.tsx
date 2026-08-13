import { createFileRoute } from '@tanstack/react-router'
import {PageHero} from "@/components/pageHero.tsx";
import {MapPlusIcon} from "lucide-react";

export const Route = createFileRoute('/_authed/_org/projects/projects-list')({
    staticData: {
        breadcrumb: 'Projects List',
    },
    component: RouteComponent,
})

function RouteComponent() {
    return (
        <section className="-mt-4 -ml-1">
            <PageHero
                type="hero"
                title="Projects"
                subtitle="Manage all project"
                showButton={true}
                buttonText="New Project"
                buttonIcon={<MapPlusIcon/>}
            />
        </section>
    )
}
