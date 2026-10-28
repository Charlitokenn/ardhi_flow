'use client'

import {useState} from 'react'
import {useAuth} from '@clerk/react'
import {useMutation} from '@tanstack/react-query'
import {usePostHog} from 'posthog-js/react'
import {apiClient} from '@/lib/api.ts'
import {Button} from '@/components/ui/button.tsx'
import {Input} from '@/components/ui/input.tsx'
import {useSmsSettings} from '@/lib/use-sms-settings.ts'
import {useAudiencePreview} from '@/lib/use-audience-preview.ts'
import {LoaderIcon} from 'lucide-react'
import {SMS_SKIP_REASON_LABELS, SMS_SKIP_REASONS} from '@ardhiflow/shared-schema'
import type {ComposeCampaign} from '../compose-campaign'

interface SendStepProps {
    campaign: ComposeCampaign
}

// The last check before sending (docs/specs/0004-sms-send-flow AC-7, AC-10):
// who gets it, who is skipped and why, the cost and the balance, all worked
// out by the server from the saved rules right now. Scheduling and recurring
// sends are not designed yet, so they are not offered.
export default function SendStep({campaign}: SendStepProps) {
    const preview = useAudiencePreview(campaign, true)
    const result = preview.data?.ok ? preview.data.data : null

    return (
        <div className="max-w-2xl space-y-6">
            <div>
                <h2 className="text-xl font-medium text-foreground mb-6">Review & Send</h2>

                {campaign.type !== 'sms' && (
                    <p className="text-sm text-muted-foreground">WhatsApp is a preview only, nothing is sent.</p>
                )}
                {preview.isFetching && (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <LoaderIcon className="size-3.5 animate-spin"/> Checking the audience, cost and balance...
                    </p>
                )}
                {preview.data && !preview.data.ok && preview.data.code !== 'sms_not_configured' && (
                    <p role="alert" className="text-sm text-destructive">{preview.data.message}</p>
                )}

                {result && (
                    <dl className="grid grid-cols-2 gap-4 rounded-lg border p-4 text-sm">
                        <div>
                            <dt className="text-xs text-muted-foreground">Recipients</dt>
                            <dd className="text-lg font-semibold">{result.recipients.length.toLocaleString()}</dd>
                        </div>
                        <div>
                            <dt className="text-xs text-muted-foreground">SMS parts in total</dt>
                            <dd className="text-lg font-semibold">{result.totalSegments.toLocaleString()}</dd>
                        </div>
                        <div>
                            <dt className="text-xs text-muted-foreground">Estimated cost</dt>
                            <dd className="text-lg font-semibold">TZS {result.estimatedCost.toLocaleString()}</dd>
                        </div>
                        <div>
                            <dt className="text-xs text-muted-foreground">NextSMS balance</dt>
                            <dd className="text-lg font-semibold">{result.balance.display}</dd>
                        </div>
                        <div className="col-span-2">
                            <dt className="text-xs text-muted-foreground">Skipped</dt>
                            <dd>
                                {SMS_SKIP_REASONS.map((reason) => (
                                    <span key={reason} className="mr-4 inline-block">
                                        {SMS_SKIP_REASON_LABELS[reason]}: <span className="font-medium">{result.skippedCounts[reason]}</span>
                                    </span>
                                ))}
                            </dd>
                        </div>
                    </dl>
                )}
                {result && !result.balanceSufficient && (
                    <p role="alert" className="mt-3 text-sm text-destructive">
                        The balance doesn't cover this campaign (the estimate plus a 2% margin). Top up NextSMS
                        or reach fewer people before sending.
                    </p>
                )}
            </div>

            <TestSendBox campaign={campaign}/>
        </div>
    )
}

type TestSendResult = {kind: 'sent'} | {kind: 'failed' | 'error'; message: string}

// Sends the current message to one typed number through the organization's
// real NextSMS account (docs/specs/0004-sms-send-flow AC-4). No preview client
// is picked in the compose flow yet, so it renders for spec 0002's sample
// client, with the template's reminder timing for {dueItems}.
function TestSendBox({campaign}: {campaign: {type: string; message: string; reminderTiming: 'UPCOMING' | 'DUE_TODAY' | 'PAST_DUE' | null}}) {
    const {getToken} = useAuth()
    const api = apiClient(getToken)
    const posthog = usePostHog()
    const settingsQuery = useSmsSettings()
    const [phoneNumber, setPhoneNumber] = useState('')
    const [result, setResult] = useState<TestSendResult | null>(null)

    const testSend = useMutation({
        mutationFn: async (): Promise<TestSendResult> => {
            const res = await api.api.campaigns['test-send'].$post({
                json: {phoneNumber, templateBody: campaign.message, reminderTiming: campaign.reminderTiming},
            })
            const body: unknown = await res.json().catch(() => null)
            const record = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
            if (!res.ok) {
                return {kind: 'error', message: typeof record.message === 'string' ? record.message : 'The test message could not be sent'}
            }
            if (record.status === 'SENT') return {kind: 'sent'}
            return {kind: 'failed', message: typeof record.errorReason === 'string' ? record.errorReason : 'NextSMS rejected the message'}
        },
        onSuccess: (outcome) => {
            setResult(outcome)
            posthog.capture(outcome.kind === 'sent' ? 'sms_test_sent' : 'sms_test_send_failed', {
                kind: outcome.kind,
            })
        },
        onError: () => setResult({kind: 'error', message: 'The test message could not be sent'}),
    })

    const configured = settingsQuery.data?.configured === true
    const canSend = campaign.type === 'sms' && configured && campaign.message.trim() !== '' && phoneNumber.trim() !== ''

    return (
        <div className="rounded-lg bg-muted/50 p-6 space-y-4">
            <h3 className="font-medium text-foreground">Test Before Sending</h3>
            <p className="text-sm text-muted-foreground">
                Send this message to one phone to check the content and formatting. It goes out through your
                NextSMS account and is charged like any other message.
            </p>
            <div>
                <label htmlFor="testPhoneNumber" className="block text-sm font-medium text-foreground mb-2">
                    Test Phone Number
                </label>
                <div className="flex gap-2">
                    <Input
                        id="testPhoneNumber"
                        type="tel"
                        value={phoneNumber}
                        onChange={(e) => {
                            setPhoneNumber(e.target.value)
                            setResult(null)
                        }}
                        placeholder="0712 345 678"
                        className="flex-1"
                    />
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => testSend.mutate()}
                        disabled={!canSend || testSend.isPending}
                    >
                        {testSend.isPending ? 'Sending...' : 'Send Test'}
                    </Button>
                </div>
                {campaign.type !== 'sms' && (
                    <p className="mt-2 text-sm text-muted-foreground">Test sends are only available for SMS.</p>
                )}
                {result && (
                    <p
                        role="status"
                        className={`mt-2 text-sm ${result.kind === 'sent' ? 'text-success' : 'text-destructive'}`}
                    >
                        {result.kind === 'sent'
                            ? 'Sent. NextSMS accepted the message, check the phone.'
                            : result.message}
                    </p>
                )}
            </div>
        </div>
    )
}
