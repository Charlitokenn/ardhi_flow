'use client'

import {useMemo, useState} from 'react'
import {useAuth} from '@clerk/react'
import {useQuery} from '@tanstack/react-query'
import {LoaderIcon, PlusIcon, Undo2Icon} from 'lucide-react'
import {SMS_SKIP_REASON_LABELS, SMS_SKIP_REASONS} from '@ardhiflow/shared-schema'
import {apiClient} from '@/lib/api.ts'
import {useAudiencePreview} from '@/lib/use-audience-preview.ts'
import {Button} from '@/components/ui/button.tsx'
import {Checkbox} from '@/components/ui/checkbox.tsx'
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover.tsx'
import {Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList} from '@/components/ui/command.tsx'
import {type ComposeCampaign, TIMING_LABELS} from '../compose-campaign'

interface AudienceStepProps {
    campaign: ComposeCampaign
    setCampaign: (campaign: ComposeCampaign) => void
}

// Rendered in pages so a 5,000 person list doesn't build 5,000 rows at once.
const PAGE_SIZE = 200

// The audience rules (docs/specs/0004-sms-send-flow AC-6, AC-7). The draft
// stores the rules (segment, timing, hand added and hand removed ids), never
// the list: the list below is worked out by the server from those rules,
// every time, with the AC-8 skip rules applied.
export default function AudienceStep({campaign, setCampaign}: AudienceStepProps) {
    const {getToken} = useAuth()
    const api = apiClient(getToken)
    const preview = useAudiencePreview(campaign, true)
    const [shown, setShown] = useState(PAGE_SIZE)
    const [searchOpen, setSearchOpen] = useState(false)

    // Also the name lookup for hand removed contacts, which the preview no
    // longer lists.
    const contactsQuery = useQuery({
        queryKey: ['contacts'],
        queryFn: async () => {
            const res = await api.api.contacts.$get()
            if (!res.ok) throw new Error(`Failed to load contacts (${res.status})`)
            return res.json()
        },
    })
    const clients = useMemo(
        () => (contactsQuery.data ?? []).filter((c) => !c.isDeleted && c.contactType === 'CLIENT'),
        [contactsQuery.data],
    )
    const nameById = useMemo(() => new Map(clients.map((c) => [c.id, c.fullName])), [clients])

    const audience = campaign.audience
    const setAudience = (next: Partial<ComposeCampaign['audience']>) =>
        setCampaign({...campaign, audience: {...audience, ...next}})

    const remove = (contactId: string) =>
        setAudience({
            includeContactIds: audience.includeContactIds.filter((id) => id !== contactId),
            excludeContactIds: [...new Set([...audience.excludeContactIds, contactId])],
        })
    const add = (contactId: string) =>
        setAudience({
            excludeContactIds: audience.excludeContactIds.filter((id) => id !== contactId),
            includeContactIds: audience.includeContactIds.includes(contactId)
                ? audience.includeContactIds
                : [...audience.includeContactIds, contactId],
        })

    const result = preview.data?.ok ? preview.data.data : null
    const listed = new Set([...(result?.recipients ?? []).map((r) => r.contactId), ...(result?.skipped ?? []).map((s) => s.contactId)])
    const searchable = clients.filter((c) => !listed.has(c.id))

    const options = [
        {id: 'ALL_CLIENTS' as const, label: 'All clients', description: 'Every client contact.'},
        // Only offered when the template has a reminder timing (AC-6).
        ...(campaign.reminderTiming
            ? [{
                id: 'DUE' as const,
                label: `Clients with ${TIMING_LABELS[campaign.reminderTiming]} installments`,
                description: 'Only clients who have something due for this reminder.',
            }]
            : []),
    ]

    if (campaign.type !== 'sms') {
        return (
            <div className="max-w-2xl">
                <h2 className="text-xl font-medium text-foreground mb-2">Select Your Audience</h2>
                <p className="text-sm text-muted-foreground">WhatsApp is a preview only, so it has no audience yet.</p>
            </div>
        )
    }

    return (
        <div className="max-w-2xl space-y-6">
            <div>
                <h2 className="text-xl font-medium text-foreground mb-6">Select Your Audience</h2>
                <div className="space-y-3" role="radiogroup" aria-label="Audience">
                    {options.map((option) => (
                        <button
                            key={option.id}
                            type="button"
                            role="radio"
                            aria-checked={audience.segment === option.id}
                            onClick={() => setAudience({segment: option.id})}
                            className={`w-full text-left p-4 rounded-lg border-2 transition-colors ${
                                audience.segment === option.id ? 'border-primary bg-primary/5' : 'border-border'
                            }`}
                        >
                            <h3 className="font-medium text-foreground">{option.label}</h3>
                            <p className="mt-1 text-sm text-muted-foreground">{option.description}</p>
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <h3 className="font-medium text-foreground">
                        Recipients {result && <span className="text-muted-foreground">({result.recipients.length.toLocaleString()})</span>}
                    </h3>
                    <Popover open={searchOpen} onOpenChange={setSearchOpen}>
                        <PopoverTrigger asChild>
                            <Button type="button" variant="outline" size="sm" className="gap-1.5">
                                <PlusIcon className="size-3.5"/> Add a client
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 p-0" align="end">
                            <Command>
                                <CommandInput placeholder="Search clients..."/>
                                <CommandList>
                                    <CommandEmpty>{contactsQuery.isLoading ? 'Loading...' : 'No client found.'}</CommandEmpty>
                                    <CommandGroup>
                                        {searchable.map((c) => (
                                            <CommandItem
                                                key={c.id}
                                                value={`${c.fullName} ${c.id}`}
                                                onSelect={() => {
                                                    add(c.id)
                                                    setSearchOpen(false)
                                                }}
                                            >
                                                {c.fullName}
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                </div>

                {campaign.message.trim() === '' && (
                    <p className="text-sm text-muted-foreground">Write the message first, the list depends on it.</p>
                )}
                {preview.isFetching && (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <LoaderIcon className="size-3.5 animate-spin"/> Working out who gets it...
                    </p>
                )}
                {preview.data && !preview.data.ok && preview.data.code !== 'sms_not_configured' && (
                    <p role="alert" className="text-sm text-destructive">{preview.data.message}</p>
                )}

                {result && (
                    <ul className="max-h-96 divide-y overflow-y-auto rounded-lg border">
                        {result.recipients.length === 0 && (
                            <li className="p-3 text-sm text-muted-foreground">Nobody gets this message yet.</li>
                        )}
                        {result.recipients.slice(0, shown).map((r) => (
                            <li key={r.contactId} className="flex items-center gap-3 px-3 py-2 text-sm">
                                <Checkbox
                                    checked
                                    onCheckedChange={() => remove(r.contactId)}
                                    aria-label={`Remove ${r.name}`}
                                />
                                <span className="flex-1 truncate">{r.name}</span>
                                <span className="font-mono text-xs text-muted-foreground">+{r.phone}</span>
                            </li>
                        ))}
                        {result.recipients.length > shown && (
                            <li className="p-2 text-center">
                                <Button type="button" variant="ghost" size="sm" onClick={() => setShown((n) => n + PAGE_SIZE)}>
                                    Show more ({(result.recipients.length - shown).toLocaleString()} left)
                                </Button>
                            </li>
                        )}
                    </ul>
                )}
            </div>

            {audience.excludeContactIds.length > 0 && (
                <div className="space-y-2">
                    <h3 className="text-sm font-medium text-foreground">Removed by hand ({audience.excludeContactIds.length})</h3>
                    <ul className="flex flex-wrap gap-2">
                        {audience.excludeContactIds.map((id) => (
                            <li key={id}>
                                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => add(id)}>
                                    <Undo2Icon className="size-3.5"/> {nameById.get(id) ?? 'Removed contact'}
                                </Button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {result && result.skipped.length > 0 && (
                <div className="rounded-lg bg-muted/50 p-4 space-y-3">
                    <h3 className="text-sm font-medium text-foreground">Skipped ({result.skipped.length})</h3>
                    {SMS_SKIP_REASONS.filter((reason) => result.skippedCounts[reason] > 0).map((reason) => (
                        <details key={reason} className="text-sm">
                            <summary className="cursor-pointer">
                                {SMS_SKIP_REASON_LABELS[reason]}: {result.skippedCounts[reason]}
                            </summary>
                            <ul className="mt-1 ml-4 list-disc text-muted-foreground">
                                {result.skipped.filter((s) => s.reason === reason).slice(0, PAGE_SIZE).map((s) => (
                                    <li key={s.contactId}>{s.name}</li>
                                ))}
                            </ul>
                        </details>
                    ))}
                </div>
            )}
        </div>
    )
}
