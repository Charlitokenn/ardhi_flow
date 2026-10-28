'use client'

import {Plus} from 'lucide-react'
import {PageHero} from "@/components/pageHero.tsx"
import {Button} from "@/components/ui/button.tsx"
import {CampaignsDataGrid} from "@/components/data-grids/campaigns-datagrid.tsx"
import type {DraftRow} from "@/components/messaging/compose-campaign.ts"

interface BroadcastDashboardProps {
    onCreateNew: () => void
    onOpenDraft?: (row: DraftRow) => void
}

export default function BroadcastDashboard({onCreateNew, onOpenDraft}: BroadcastDashboardProps) {
    return (
        <div className="-my-3.5 -mx-5">
            <header className="px-5">
                <div className="flex items-center justify-between">
                    <PageHero
                        type="hero"
                        title="Message Broadcasts"
                        subtitle="Create and manage SMS and WhatsApp campaigns"
                    />
                    <Button
                        onClick={onCreateNew}
                        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90 transition-opacity"
                    >
                        <Plus className="h-4 w-4"/>
                        Create Campaign
                    </Button>
                </div>
            </header>

            <div className="px-5">
                <CampaignsDataGrid onCreateNew={onCreateNew} onOpenDraft={onOpenDraft}/>
            </div>
        </div>
    )
}
