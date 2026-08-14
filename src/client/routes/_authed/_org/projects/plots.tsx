import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'
import { useState } from 'react'
import { LandPlot } from 'lucide-react'
import { apiClient } from '@/lib/api.ts'
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { usePostHog } from 'posthog-js/react'

export const Route = createFileRoute('/_authed/_org/projects/plots')({
    staticData: {
        breadcrumb: 'Plots',
    },
    component: PlotsPage,
})

function PlotsPage() {
    const { getToken } = useAuth()
    const queryClient = useQueryClient()
    const api = apiClient(getToken)

    const plotsQuery = useQuery({
        queryKey: ['plots'],
        queryFn: async () => {
            const res = await api.api.plots.$get()
            if (!res.ok) throw new Error('Failed to load plots')
            return res.json()
        },
    })

    const posthog = usePostHog()

    const createPlot = useMutation({
        mutationFn: async (input: { projectId: string; plotNumber: string; unsurveyedSize: string }) => {
            const res = await api.api.plots.$post({ json: input })
            if (!res.ok) throw new Error('Failed to create plot')
            return res.json()
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['plots'] })
            posthog.capture('plot_created', {
                project_id: variables.projectId,
            })
        },
        onError: () => {
            posthog.capture('plot_creation_failed')
        },
    })

    return (
        <div className="flex flex-col gap-6">
            <div>
                <h1 className="text-lg font-semibold">Plots</h1>
                <p className="text-sm text-muted-foreground">Every plot you're selling, and what it's worth now.</p>
            </div>

            <NewPlotForm
                pending={createPlot.isPending}
                error={createPlot.isError}
                onSubmit={(input) => createPlot.mutate(input)}
            />

            <PlotsTable
                plots={plotsQuery.data}
                isLoading={plotsQuery.isLoading}
                isError={plotsQuery.isError}
            />
        </div>
    )
}

function NewPlotForm({
                         pending,
                         error,
                         onSubmit,
                     }: {
    pending: boolean
    error: boolean
    onSubmit: (input: { projectId: string; plotNumber: string; unsurveyedSize: string }) => void
}) {
    const [projectId, setProjectId] = useState('')
    const [plotNumber, setPlotNumber] = useState('')
    const [unsurveyedSize, setUnsurveyedSize] = useState('')

    return (
        <form
            className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-3"
            onSubmit={(e) => {
                e.preventDefault()
                if (!projectId || !plotNumber || !unsurveyedSize) return
                onSubmit({ projectId, plotNumber, unsurveyedSize })
                setProjectId('')
                setPlotNumber('')
                setUnsurveyedSize('')
            }}
        >
            <Field label="Project ID">
                <Input value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="Project UUID" required />
            </Field>
            <Field label="Plot number">
                <Input value={plotNumber} onChange={(e) => setPlotNumber(e.target.value)} placeholder="142" required />
            </Field>
            <Field label="Unsurveyed size (m²)">
                <Input
                    value={unsurveyedSize}
                    onChange={(e) => setUnsurveyedSize(e.target.value)}
                    placeholder="500"
                    inputMode="decimal"
                    required
                />
            </Field>
            <Button type="submit" disabled={pending}>
                {pending ? 'Adding…' : 'Add plot'}
            </Button>
            {error && <p className="w-full text-xs text-destructive">Couldn't add that plot. Try again.</p>}
        </form>
    )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {label}
            {children}
        </label>
    )
}

function PlotsTable({
                        plots,
                        isLoading,
                        isError,
                    }: {
    plots: Array<{
        id: string
        plotNumber: string
        surveyedPlotNumber: string | null
        availability: 'AVAILABLE' | 'SOLD'
        unsurveyedSize: string
        surveyedSize: string | null
    }> | undefined
    isLoading: boolean
    isError: boolean
}) {
    if (isLoading) {
        return <p className="text-sm text-muted-foreground">Loading plots…</p>
    }

    if (isError) {
        return <p className="text-sm text-destructive">Couldn't load plots. Refresh to try again.</p>
    }

    if (!plots || plots.length === 0) {
        return (
            <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border p-6">
                <LandPlot className="size-5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No plots recorded yet — add your first one above.</p>
            </div>
        )
    }

    return (
        <table className="w-full text-sm">
            <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-1.5 font-medium">Plot number</th>
                <th className="py-1.5 font-medium">Availability</th>
                <th className="py-1.5 text-right font-medium">Size (m²)</th>
            </tr>
            </thead>
            <tbody>
            {plots.map((plot) => (
                <tr key={plot.id} className="border-b border-border/60">
                    <td className="py-1.5 font-medium">{plot.surveyedPlotNumber ?? plot.plotNumber}</td>
                    <td className="py-1.5 text-muted-foreground">{plot.availability}</td>
                    <td className="py-1.5 text-right tabular-nums">
                        {plot.surveyedSize ?? plot.unsurveyedSize}
                    </td>
                </tr>
            ))}
            </tbody>
        </table>
    )
}
