'use client'

import {Plus} from 'lucide-react'

interface BroadcastDashboardProps {
    onCreateNew: () => void
}

export default function BroadcastDashboard({onCreateNew}: BroadcastDashboardProps) {
    return (
        <div className="flex min-h-full flex-col">
            <header className="border-b border-border px-0 py-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-foreground">Bulk Messages</h1>
                        <p className="mt-1 text-sm text-muted-foreground">Create and manage SMS and WhatsApp
                            campaigns</p>
                    </div>
                    <button
                        onClick={onCreateNew}
                        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90 transition-opacity"
                    >
                        <Plus className="h-4 w-4"/>
                        Create Campaign
                    </button>
                </div>
            </header>

            <div className="flex flex-1 flex-col items-center justify-center px-8 py-24">
                <div className="text-center">
                    <h2 className="text-2xl font-semibold text-foreground">Welcome to your campaigns</h2>
                    <p className="mt-2 text-muted-foreground">You haven&apos;t created any campaigns yet.</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Create campaigns to send bulk messages and track their performance.
                    </p>
                    <button
                        onClick={onCreateNew}
                        className="mt-6 inline-flex rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground hover:opacity-90 transition-opacity"
                    >
                        Create Your First Campaign
                    </button>
                </div>
            </div>
        </div>
    )
}
