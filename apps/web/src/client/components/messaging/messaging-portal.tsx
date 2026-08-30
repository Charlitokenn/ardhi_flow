import {useState} from 'react'
import BroadcastDashboard from '@/components/messaging/broadcast-dashboard.tsx'
import BroadcastFlow from '@/components/messaging/broadcast-flow'

export default function MessagingPortal() {
    const [showFlow, setShowFlow] = useState(false)

    return (
        <>
            {!showFlow ? (
                <BroadcastDashboard onCreateNew={() => setShowFlow(true)}/>
            ) : (
                <BroadcastFlow onBack={() => setShowFlow(false)}/>
            )}
        </>
    )
}