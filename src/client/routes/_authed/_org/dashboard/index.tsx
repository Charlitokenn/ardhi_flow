import { createFileRoute } from '@tanstack/react-router'
import {PageHero} from "@/components/pageHero.tsx";
import {useUser} from "@clerk/react";
import {getGreeting} from "@/lib/utils.ts";
import {UserPlusIcon} from "lucide-react";

export const Route = createFileRoute('/_authed/_org/dashboard/')({
    staticData: {
        breadcrumb: 'Dashboard',
    },
    component: DashboardHome,
})

function DashboardHome() {
    const { user } = useUser()
    const greeting = getGreeting()

    return (
        <section className="-mt-4 -ml-1">
            <PageHero
                type="greeting"
                title={greeting + user?.firstName + ","}
                subtitle="testing about things that are here"
                showButton={true}
                buttonText="New Project"
                buttonIcon={<UserPlusIcon/>}
                showBulkUploader={true}
            />
        </section>

    )
}
