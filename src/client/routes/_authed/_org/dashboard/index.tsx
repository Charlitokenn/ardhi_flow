import { createFileRoute, Link } from '@tanstack/react-router'
import { LandPlot } from 'lucide-react'
import { Button } from '@/components/ui/button.tsx'
import { usePostHog } from 'posthog-js/react'

export const Route = createFileRoute('/_authed/_org/dashboard/')({
    component: DashboardHome,
})

function DashboardHome() {
    const posthog = usePostHog()

    return (
        <div className="flex flex-col gap-6">
            <div>
                <h1 className="text-lg font-semibold">Overview</h1>
                <p className="text-sm text-muted-foreground">
                    A quick look at your workspace. Start by adding a plot.
                </p>
            </div>

            <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border p-6">
                <LandPlot className="size-5 text-muted-foreground" />
                <div>
                    <h2 className="text-sm font-medium">No plots yet</h2>
                    <p className="text-sm text-muted-foreground">
                        Record a plot and its buyer to start tracking installments.
                    </p>
                </div>
                <Button asChild size="sm" onClick={() => posthog.capture('add_plot_clicked')}>
                    <Link to="/dashboard/plots">Add a plot</Link>
                </Button>
            </div>
        </div>
    )
}
