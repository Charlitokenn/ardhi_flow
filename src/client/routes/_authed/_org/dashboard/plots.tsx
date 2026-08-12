import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'
import { useState } from 'react'
import { LandPlot } from 'lucide-react'
import { apiClient } from '@/lib/api.ts'
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { usePostHog } from 'posthog-js/react'

export const Route = createFileRoute('/_authed/_org/dashboard/plots')({
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
        mutationFn: async (input: { reference: string; location: string; priceTotal: string }) => {
            const res = await api.api.plots.$post({ json: input })
            if (!res.ok) throw new Error('Failed to create plot')
            return res.json()
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['plots'] })
            posthog.capture('plot_created', {
                has_location: Boolean(variables.location),
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
    onSubmit: (input: { reference: string; location: string; priceTotal: string }) => void
}) {
    const [reference, setReference] = useState('')
    const [location, setLocation] = useState('')
    const [priceTotal, setPriceTotal] = useState('')

    return (
        <form
            className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-3"
            onSubmit={(e) => {
                e.preventDefault()
                if (!reference || !priceTotal) return
                onSubmit({ reference, location, priceTotal })
                setReference('')
                setLocation('')
                setPriceTotal('')
            }}
        >
            <Field label="Reference">
                <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="PLT-0142" required />
            </Field>
            <Field label="Location">
                <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Kigamboni, block 4" />
            </Field>
            <Field label="Price (TZS)">
                <Input
                    value={priceTotal}
                    onChange={(e) => setPriceTotal(e.target.value)}
                    placeholder="18000000"
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
    plots: Array<{ id: string; reference: string; location: string | null; priceTotal: string }> | undefined
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
                <th className="py-1.5 font-medium">Reference</th>
                <th className="py-1.5 font-medium">Location</th>
                <th className="py-1.5 text-right font-medium">Price</th>
            </tr>
            </thead>
            <tbody>
            {plots.map((plot) => (
                <tr key={plot.id} className="border-b border-border/60">
                    <td className="py-1.5 font-medium">{plot.reference}</td>
                    <td className="py-1.5 text-muted-foreground">{plot.location ?? '—'}</td>
                    <td className="py-1.5 text-right tabular-nums">
                        {new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(
                            Number(plot.priceTotal),
                        )}
                    </td>
                </tr>
            ))}
            </tbody>
        </table>
    )
}
