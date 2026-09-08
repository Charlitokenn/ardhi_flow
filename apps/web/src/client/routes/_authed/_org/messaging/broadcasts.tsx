import {createFileRoute} from '@tanstack/react-router'
import BroadcastDashboard from "@/components/messaging/broadcast-dashboard.tsx";

export const Route = createFileRoute('/_authed/_org/messaging/broadcasts')({
    staticData: {
        breadcrumb: 'Broadcasts',
    },
    component: RouteComponent,
})

function RouteComponent() {
    return (
        <section className="">
            <BroadcastDashboard/>
        </section>
    )
}
