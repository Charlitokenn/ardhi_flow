import {createFileRoute} from '@tanstack/react-router'
import {useState} from 'react'
import BroadcastDashboard from "@/components/messaging/broadcast-dashboard.tsx"
import BroadcastFlow from "@/components/messaging/broadcast-flow"
import type {DraftRow} from "@/components/messaging/compose-campaign.ts"

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
    // A DRAFT reopened from the dashboard (docs/specs/0004-sms-send-flow AC-5).
    const [draft, setDraft] = useState<DraftRow | null>(null)

    return (
        <section className="">
            {!showFlow ? (
                <BroadcastDashboard
                    onCreateNew={() => {
                        setDraft(null)
                        setShowFlow(true)
                    }}
                    onOpenDraft={(row) => {
                        setDraft(row)
                        setShowFlow(true)
                    }}
                />
            ) : (
                <BroadcastFlow
                    key={draft?.id ?? "new"}
                    draft={draft}
                    onBack={() => {
                        setDraft(null)
                        setShowFlow(false)
                    }}
                />
            )}
        </section>
    )
}
