'use client'

interface SendStepProps {
    campaign: any
    setCampaign: (campaign: any) => void
}

export default function SendStep({campaign, setCampaign}: SendStepProps) {
    const sendOptions = [
        {
            id: 'immediate',
            label: 'Send Immediately',
            description: 'The message will be sent right away.',
        },
        {
            id: 'scheduled',
            label: 'Schedule for Later',
            description: 'Choose a specific date and time to send the message.',
            icon: '📅',
            badge: 'Pro',
        },
        {
            id: 'recurring',
            label: 'Set Up Recurring Messages',
            description: 'Send messages on a recurring schedule (daily, weekly, monthly).',
            icon: '🔄',
            badge: 'Pro',
        },
    ]

    return (
        <div className="max-w-2xl space-y-6">
            <div>
                <h2 className="text-xl font-medium text-foreground mb-6">Send & Schedule</h2>

                <div className="space-y-3">
                    {sendOptions.map((option) => (
                        <button
                            key={option.id}
                            onClick={() => setCampaign({...campaign, sendOption: option.id})}
                            className={`w-full text-left p-4 rounded-lg border-2 transition-colors ${
                                campaign.sendOption === option.id
                                    ? 'border-primary bg-primary/5'
                                    : 'border-border hover:border-border'
                            }`}
                        >
                            <div className="flex items-start gap-3">
                                <input
                                    type="radio"
                                    checked={campaign.sendOption === option.id}
                                    onChange={() => {
                                    }}
                                    className="mt-1"
                                />
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-lg">{option.icon}</span>
                                        <h3 className="font-medium text-foreground">{option.label}</h3>
                                        {option.badge && (
                                            <span
                                                className="px-2 py-0.5 text-xs font-medium rounded bg-primary/20 text-primary">
                        {option.badge}
                      </span>
                                        )}
                                    </div>
                                    <p className="mt-1 text-sm text-muted-foreground">{option.description}</p>
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Send Options Details */}
            {campaign.sendOption === 'scheduled' && (
                <div className="rounded-lg bg-muted/50 p-6 space-y-4">
                    <h3 className="font-medium text-foreground">Schedule Your Message</h3>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">Date</label>
                            <input
                                type="date"
                                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">Time</label>
                            <input
                                type="time"
                                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">Timezone</label>
                            <select
                                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
                                <option>UTC</option>
                                <option>EST</option>
                                <option>PST</option>
                                <option>CST</option>
                            </select>
                        </div>
                    </div>
                </div>
            )}

            {campaign.sendOption === 'recurring' && (
                <div className="rounded-lg bg-muted/50 p-6 space-y-4">
                    <h3 className="font-medium text-foreground">Recurring Schedule</h3>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">Frequency</label>
                            <select
                                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
                                <option>Daily</option>
                                <option>Weekly</option>
                                <option>Monthly</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">Time</label>
                            <input
                                type="time"
                                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">End Date
                                (optional)</label>
                            <input
                                type="date"
                                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Test Section */}
            <div className="rounded-lg bg-muted/50 p-6 space-y-4">
                <h3 className="font-medium text-foreground">Test Before Sending</h3>
                <p className="text-sm text-muted-foreground">
                    Send a test message to verify the content and formatting.
                </p>
                <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Test Phone Number</label>
                    <div className="flex gap-2">
                        <input
                            type="tel"
                            placeholder="+1234567890"
                            className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        <button
                            className="px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors">
                            Send Test
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
