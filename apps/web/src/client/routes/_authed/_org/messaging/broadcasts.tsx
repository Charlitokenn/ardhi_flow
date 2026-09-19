import {createFileRoute} from '@tanstack/react-router'
import {useState} from 'react'
import BroadcastDashboard from "@/components/messaging/broadcast-dashboard.tsx"
import BroadcastFlow from "@/components/messaging/broadcast-flow"

export const Route = createFileRoute('/_authed/_org/messaging/broadcasts')({
    staticData: {
        breadcrumb: 'Broadcasts',
    },
    component: RouteComponent,
})

function RouteComponent() {
    // In-component toggle rather than a /broadcasts/new sub-route — see
    // docs/specs/0003-connect-broadcast-dashboard. Moved here from the now
    // retired messaging-portal.tsx, which had no other caller left once the
    // Reminder page's own entry point into this same UI was removed.
    const [showFlow, setShowFlow] = useState(false)

    return (
        <section className="">
            {!showFlow ? (
                <BroadcastDashboard onCreateNew={() => setShowFlow(true)}/>
            ) : (
                <BroadcastFlow onBack={() => setShowFlow(false)}/>
            )}
        </section>
    )
}
