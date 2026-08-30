'use client'

interface AudienceStepProps {
  campaign: any
  setCampaign: (campaign: any) => void
}

export default function AudienceStep({ campaign, setCampaign }: AudienceStepProps) {
  const audienceOptions = [
    {
      id: 'all',
      label: 'Send to All Contacts',
      description: 'Send this message to all contacts in your list.',
    },
    {
      id: 'group',
      label: 'Send to Contact Group',
      description: 'Personalize your message based on predefined contact groups.',
      badge: 'Pro',
      icon: '👥',
    },
    {
      id: 'custom',
      label: 'Send to Custom Audience',
      description: 'Personalize your message based on phone numbers, custom segments, and more.',
      badge: 'Pro',
      icon: '🎯',
    },
  ]

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-6">Select Your Audience</h2>

        <div className="space-y-3">
          {audienceOptions.map((option) => (
            <button
              key={option.id}
              onClick={() => setCampaign({ ...campaign, selectedAudience: option.id })}
              className={`w-full text-left p-4 rounded-lg border-2 transition-colors ${
                campaign.selectedAudience === option.id
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-border'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    checked={campaign.selectedAudience === option.id}
                    onChange={() => {}}
                    className="mt-1"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{option.icon}</span>
                      <h3 className="font-medium text-foreground">{option.label}</h3>
                      {option.badge && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded bg-primary/20 text-primary">
                          {option.badge}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{option.description}</p>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Custom audience details */}
      {campaign.selectedAudience === 'custom' && (
        <div className="rounded-lg bg-muted/50 p-6 space-y-4">
          <h3 className="font-medium text-foreground">Custom Audience Setup</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Upload Phone Numbers (CSV)
              </label>
              <input
                type="file"
                accept=".csv"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Upload a CSV file with phone numbers in E.164 format (e.g., +1234567890)
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Or paste phone numbers
              </label>
              <textarea
                placeholder="+1234567890&#10;+1987654321&#10;+44..."
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                rows={4}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                One phone number per line, in E.164 format
              </p>
            </div>
          </div>
        </div>
      )}

      {campaign.selectedAudience === 'group' && (
        <div className="rounded-lg bg-muted/50 p-6 space-y-4">
          <h3 className="font-medium text-foreground">Select Contact Groups</h3>
          <div className="space-y-2">
            {['Customers', 'Leads', 'VIP', 'Team'].map((group) => (
              <label key={group} className="flex items-center gap-3 p-3 rounded border border-border hover:bg-muted/50 cursor-pointer">
                <input type="checkbox" className="rounded" />
                <span className="text-sm font-medium text-foreground">{group}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
