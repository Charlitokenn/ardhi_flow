'use client'

import { useState } from 'react'
import { ChevronRight, ChevronLeft } from 'lucide-react'
import ContentStep from './steps/content-step'
import AudienceStep from './steps/audience-step'
import SendStep from './steps/send-step'

type Step = 'content' | 'audience' | 'send'

interface BroadcastFlowProps {
  onBack: () => void
}

export default function BroadcastFlow({ onBack }: BroadcastFlowProps) {
  const [currentStep, setCurrentStep] = useState<Step>('content')
  const [campaign, setCampaign] = useState({
    type: 'sms' as 'sms' | 'whatsapp',
    title: '',
    message: '',
    selectedAudience: 'all' as 'all' | 'group' | 'custom',
    recipientCount: 0,
    sendOption: 'immediate' as 'immediate' | 'scheduled' | 'recurring',
  })

  const steps: { id: Step; label: string }[] = [
    { id: 'content', label: 'Content' },
    { id: 'audience', label: 'Audience' },
    { id: 'send', label: 'Send / Schedule' },
  ]

  const stepIndex = steps.findIndex((s) => s.id === currentStep)

  const handleNext = () => {
    if (stepIndex < steps.length - 1) {
      setCurrentStep(steps[stepIndex + 1].id)
    }
  }

  const handlePrev = () => {
    if (stepIndex > 0) {
      setCurrentStep(steps[stepIndex - 1].id)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">New Campaign</h1>
          </div>
          <button
            onClick={onBack}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            ✕
          </button>
        </div>
      </header>

      {/* Step Indicator */}
      <div className="border-b border-border px-8 py-4">
        <div className="flex items-center gap-2">
          {steps.map((step, idx) => (
            <div key={step.id} className="flex items-center gap-2">
              <button
                onClick={() => setCurrentStep(step.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                  currentStep === step.id
                    ? 'text-primary font-medium'
                    : idx < stepIndex
                      ? 'text-muted-foreground hover:text-foreground'
                      : 'text-muted-foreground'
                }`}
              >
                {step.label}
              </button>
              {idx < steps.length - 1 && (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1">
        <div className="flex-1 px-8 py-8">
          {currentStep === 'content' && (
            <ContentStep campaign={campaign} setCampaign={setCampaign} />
          )}
          {currentStep === 'audience' && (
            <AudienceStep campaign={campaign} setCampaign={setCampaign} />
          )}
          {currentStep === 'send' && (
            <SendStep campaign={campaign} setCampaign={setCampaign} />
          )}
        </div>

        {/* Right Panel */}
        <div className="w-96 border-l border-border bg-card/50 px-6 py-8">
          {currentStep === 'content' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Preview</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {campaign.type === 'sms' ? 'SMS Preview' : 'WhatsApp Preview'}
                </p>
              </div>
              <PhonePreview campaign={campaign} />
            </div>
          )}

          {currentStep === 'audience' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Selected Recipients</h3>
              </div>
              <div className="flex items-center justify-center">
                <div className="text-center">
                  <div className="text-5xl font-bold text-primary">{campaign.recipientCount}</div>
                  <p className="mt-2 text-sm text-muted-foreground">recipients selected</p>
                  <button
                    onClick={() => setCampaign({ ...campaign, recipientCount: Math.floor(Math.random() * 10000) + 100 })}
                    className="mt-4 px-3 py-1 text-xs rounded border border-border hover:bg-muted transition-colors"
                  >
                    Refresh count
                  </button>
                </div>
              </div>
            </div>
          )}

          {currentStep === 'send' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Summary</h3>
              </div>
              <div className="space-y-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Channel</p>
                  <p className="font-medium text-foreground capitalize">{campaign.type}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Recipients</p>
                  <p className="font-medium text-foreground">{campaign.recipientCount.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Send Option</p>
                  <p className="font-medium text-foreground capitalize">{campaign.sendOption}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border bg-card/50 px-8 py-4">
        <div className="flex items-center justify-between">
          <button
            onClick={handlePrev}
            disabled={stepIndex === 0}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            {stepIndex < steps.length - 1 ? (
              <button
                onClick={handleNext}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={onBack}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Send Campaign
              </button>
            )}
          </div>
        </div>
      </footer>
    </div>
  )
}

function PhonePreview({ campaign }: { campaign: any }) {
  const isSms = campaign.type === 'sms'

  return (
    <div className="flex justify-center">
      <div className="p-1.5 bg-foreground shadow-lg rounded-3xl w-64">
        <div className={`rounded-[1.25rem] ${isSms ? 'bg-slate-100' : 'bg-white'} p-4 space-y-2`}>
          {isSms ? (
            /* SMS Preview */
            <div className="space-y-3">
              <div className="text-xs font-semibold text-slate-900 flex justify-between">
                <span>Messages</span>
                <span className="text-slate-500">9:41</span>
              </div>
              <div className="text-xs text-slate-500 pb-2 border-b border-slate-200">
                Mom
              </div>
              <div className="bg-blue-500 text-white rounded-lg p-3 ml-auto max-w-xs text-xs break-words">
                {campaign.message || 'Your message will appear here'}
              </div>
              <div className="text-xs text-slate-400 text-center mt-2">
                {campaign.message ? `${campaign.message.length}` : '0'} characters
              </div>
            </div>
          ) : (
            /* WhatsApp Preview */
            <div className="space-y-3">
              <div className="text-xs font-semibold text-slate-900 flex justify-between">
                <span>Mom</span>
                <span className="text-slate-500">9:41</span>
              </div>
              <div className="space-y-2">
                <div className="bg-green-100 text-slate-900 rounded-lg rounded-br-none p-3 max-w-xs text-xs break-words">
                  <p>{campaign.message || 'Your message will appear here'}</p>
                </div>
                <div className="flex justify-end">
                  <span className="text-xs text-slate-400">
                    {campaign.message ? `${campaign.message.length}` : '0'} characters
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
