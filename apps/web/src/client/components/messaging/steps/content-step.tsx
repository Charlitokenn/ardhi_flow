'use client'

import {useAuth} from '@clerk/react'
import {useQuery} from '@tanstack/react-query'
import {useState} from 'react'
import {apiClient} from '@/lib/api.ts'
import {ChevronDownIcon} from 'lucide-react'

interface ContentStepProps {
    campaign: any
    setCampaign: (campaign: any) => void
}

interface MessageTemplateSummary {
    id: string
    name: string
    channel: string
    isActive: boolean
    body: string
}

export default function ContentStep({campaign, setCampaign}: ContentStepProps) {
    const maxLength = campaign.type === 'sms' ? 160 : 4096
    const {getToken} = useAuth()
    const api = apiClient(getToken)
    const [pickerOpen, setPickerOpen] = useState(false)

    // Only templates for the channel currently selected above, and only
    // ones staff have kept active. Inserts the raw body — tokens like
    // {firstName}/{dueItems} stay visible as written. No per-recipient
    // substitution happens here; that's the future NextSMS send-flow spec's
    // job (see docs/specs/0002-message-templates AC-9).
    const templatesQuery = useQuery({
        queryKey: ['message-templates'],
        queryFn: async () => {
            const res = await api.api['message-templates'].$get()
            if (!res.ok) throw new Error(`Failed to load templates (${res.status})`)
            return res.json() as Promise<MessageTemplateSummary[]>
        },
    })

    const availableTemplates = (templatesQuery.data ?? []).filter(
        (t) => t.isActive && t.channel === campaign.type.toUpperCase(),
    )

    return (
        <div className="max-w-2xl space-y-8">
            <div>
                <h2 className="text-xl font-medium text-foreground mb-6">Message Content</h2>

                {/* Channel Selection */}
                <div className="mb-8">
                    <label className="block text-sm font-medium text-foreground mb-3">Channel</label>
                    <div className="flex gap-4">
                        {(['sms', 'whatsapp'] as const).map((type) => (
                            <button
                                key={type}
                                onClick={() => setCampaign({...campaign, type})}
                                className={`px-4 py-3 rounded-lg font-medium transition-colors ${
                                    campaign.type === type
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                                }`}
                            >
                                {type === 'sms' ? 'SMS' : 'WhatsApp'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Title (for WhatsApp only) */}
                {campaign.type === 'whatsapp' && (
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-foreground mb-2">
                            Title (optional)
                        </label>
                        <input
                            type="text"
                            value={campaign.title}
                            onChange={(e) => setCampaign({...campaign, title: e.target.value})}
                            placeholder="Add a title for this message"
                            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                            maxLength={100}
                        />
                        <p className="mt-1 text-xs text-muted-foreground text-right">{campaign.title.length}/100</p>
                    </div>
                )}

                {/* Message */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-foreground">Message</label>
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setPickerOpen((open) => !open)}
                                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                            >
                                Use a template <ChevronDownIcon className="size-3.5"/>
                            </button>
                            {pickerOpen && (
                                <div className="absolute right-0 z-10 mt-1 w-72 rounded-lg border border-border bg-background shadow-md">
                                    {templatesQuery.isLoading && (
                                        <p className="px-3 py-2 text-xs text-muted-foreground">Loading...</p>
                                    )}
                                    {!templatesQuery.isLoading && availableTemplates.length === 0 && (
                                        <p className="px-3 py-2 text-xs text-muted-foreground">
                                            No active {campaign.type === 'sms' ? 'SMS' : 'WhatsApp'} templates yet.
                                        </p>
                                    )}
                                    {availableTemplates.map((t) => (
                                        <button
                                            key={t.id}
                                            type="button"
                                            onClick={() => {
                                                setCampaign({...campaign, message: t.body})
                                                setPickerOpen(false)
                                            }}
                                            className="block w-full truncate px-3 py-2 text-left text-sm hover:bg-muted"
                                        >
                                            {t.name}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center justify-end mb-2">
                        <span className="text-xs text-muted-foreground">
              {campaign.message.length}/{maxLength}
            </span>
                    </div>
                    <textarea
                        value={campaign.message}
                        onChange={(e) => {
                            const text = e.target.value.slice(0, maxLength)
                            setCampaign({...campaign, message: text})
                        }}
                        placeholder={`Type your ${campaign.type === 'sms' ? 'SMS' : 'WhatsApp'} message here...`}
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                        rows={6}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                        {campaign.type === 'sms' ? (
                            <>
                                SMS messages are limited to {maxLength} characters. Longer messages will be split into
                                multiple SMS.
                            </>
                        ) : (
                            <>
                                WhatsApp messages can be up to {maxLength} characters.
                            </>
                        )}
                    </p>
                </div>
            </div>

            {/* Character Count Indicator */}
            {campaign.message && (
                <div className="rounded-lg bg-muted/50 p-4">
                    <h3 className="text-sm font-medium text-foreground mb-3">Message Info</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <p className="text-muted-foreground">Characters</p>
                            <p className="font-semibold text-foreground">{campaign.message.length}</p>
                        </div>
                        {campaign.type === 'sms' && (
                            <div>
                                <p className="text-muted-foreground">SMS Parts</p>
                                <p className="font-semibold text-foreground">
                                    {Math.ceil(campaign.message.length / maxLength)}
                                </p>
                            </div>
                        )}
                        <div>
                            <p className="text-muted-foreground">Words</p>
                            <p className="font-semibold text-foreground">
                                {campaign.message.split(/\s+/).filter(Boolean).length}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
