import {useState} from "react"
import {useAuth} from "@clerk/react"
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query"
import {usePostHog} from "posthog-js/react"
import {toast} from "sonner"
import {CheckIcon, CopyIcon, MessageSquareTextIcon, TriangleAlertIcon} from "lucide-react"
import {apiClient} from "@/lib/api.ts"
import {Button} from "@/components/ui/button.tsx"
import {Input} from "@/components/ui/input.tsx"
import {InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput} from "@/components/ui/input-group.tsx"
import {Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSet} from "@/components/ui/field.tsx"
import {Skeleton} from "@/components/ui/skeleton.tsx"
import {useSmsSettings} from "@/lib/use-sms-settings.ts"

// Reads `message` (or `error`) from an API error body, the shape every SMS
// endpoint uses: { error: <code>, message: <text> }.
async function errorMessageFrom(res: { json(): Promise<unknown> }, fallback: string): Promise<string> {
    const body: unknown = await res.json().catch(() => null)
    if (body && typeof body === "object") {
        const record = body as Record<string, unknown>
        if (typeof record.message === "string") return record.message
        if (typeof record.error === "string") return record.error
    }
    return fallback
}

function CopyField({id, label, value}: { id: string; label: string; value: string }) {
    const [copied, setCopied] = useState(false)
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(value)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            toast.error("Could not copy, select the text and copy it by hand")
        }
    }
    return (
        <Field>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            <InputGroup>
                <InputGroupInput id={id} value={value} readOnly className="font-mono text-xs"/>
                <InputGroupAddon align="inline-end">
                    <InputGroupButton aria-label={`Copy ${label.toLowerCase()}`} onClick={copy} size="icon-xs">
                        {copied ? <CheckIcon/> : <CopyIcon/>}
                    </InputGroupButton>
                </InputGroupAddon>
            </InputGroup>
        </Field>
    )
}

// The "SMS" page in the organization settings dialog (docs/specs/0004-sms-send-flow,
// AC-1, AC-2). An org admin connects the company's own NextSMS account here;
// everyone else only sees whether SMS is set up, the sender ID and the balance.
// The API token is never sent back to the browser, only its last 4 characters.
export function SmsSettingsForm() {
    const {getToken, has} = useAuth()
    const isAdmin = has?.({role: "org:admin"}) ?? false
    const queryClient = useQueryClient()
    const posthog = usePostHog()
    const api = apiClient(getToken)

    const [senderId, setSenderId] = useState("")
    const [apiToken, setApiToken] = useState("")
    const [seeded, setSeeded] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [accountChanged, setAccountChanged] = useState(false)

    const settingsQuery = useSmsSettings()
    const settings = settingsQuery.data

    const balanceQuery = useQuery({
        queryKey: ["sms-balance"],
        enabled: settings?.configured === true,
        queryFn: async () => {
            const res = await api.api["sms-settings"].balance.$get()
            if (!res.ok) throw new Error(await errorMessageFrom(res, "Could not read the NextSMS balance"))
            return res.json()
        },
    })

    if (settings && !seeded) {
        setSeeded(true)
        setSenderId(settings.senderId ?? "")
    }

    const save = useMutation({
        mutationFn: async () => {
            const res = await api.api["sms-settings"].$put({
                json: {senderId: senderId.trim(), ...(apiToken.trim() ? {apiToken: apiToken.trim()} : {})},
            })
            if (!res.ok) throw new Error(await errorMessageFrom(res, "Failed to save SMS settings"))
            return res.json()
        },
        onSuccess: (saved) => {
            setApiToken("")
            setError(null)
            setAccountChanged(saved.accountChanged)
            queryClient.setQueryData(["sms-settings"], saved)
            queryClient.invalidateQueries({queryKey: ["sms-settings"]})
            queryClient.invalidateQueries({queryKey: ["sms-balance"]})
            posthog.capture("sms_settings_saved", {accountChanged: saved.accountChanged})
            toast("Save Successful", {
                description: "NextSMS account connected",
                duration: 5000,
                icon: <MessageSquareTextIcon className="size-6"/>,
            })
        },
        onError: (err) => {
            const message = err instanceof Error ? err.message : "Failed to save SMS settings"
            setError(message)
            posthog.capture("sms_settings_save_failed", {message})
        },
    })

    const handleSave = () => {
        if (!senderId.trim()) {
            setError("Enter the sender ID registered with NextSMS")
            return
        }
        if (!settings?.configured && !apiToken.trim()) {
            setError("Enter the NextSMS API token")
            return
        }
        save.mutate()
    }

    if (settingsQuery.isLoading) {
        return (
            <div className="space-y-3">
                <Skeleton className="h-9 w-full"/>
                <Skeleton className="h-9 w-full"/>
            </div>
        )
    }
    if (settingsQuery.isError || !settings) {
        return <p className="text-sm text-destructive">Could not load SMS settings.</p>
    }

    const balanceLine = settings.configured && (
        <p className="text-sm text-muted-foreground">
            Balance:{" "}
            <span className="font-medium text-foreground">
                {balanceQuery.isLoading
                    ? "Loading..."
                    : balanceQuery.isError
                        ? "unavailable"
                        : balanceQuery.data?.display}
            </span>
        </p>
    )

    if (!isAdmin) {
        return (
            <div className="space-y-2">
                {settings.configured ? (
                    <>
                        <p className="text-sm">
                            SMS is set up. Messages go out as{" "}
                            <span className="font-medium">{settings.senderId}</span>.
                        </p>
                        {balanceLine}
                    </>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        SMS is not set up yet. Ask an org admin to connect your NextSMS account.
                    </p>
                )}
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <FieldSet>
                <FieldGroup>
                    <Field orientation="responsive">
                        <FieldContent>
                            <FieldLabel htmlFor="smsSenderId">Sender ID</FieldLabel>
                            <Input
                                id="smsSenderId"
                                value={senderId}
                                onChange={(e) => setSenderId(e.target.value)}
                                placeholder="e.g. ARDHIFLOW"
                            />
                            <FieldDescription>Exactly as approved by NextSMS, with bulk sending enabled.</FieldDescription>
                        </FieldContent>
                        <FieldContent>
                            <FieldLabel htmlFor="smsApiToken">API token</FieldLabel>
                            <Input
                                id="smsApiToken"
                                type="password"
                                autoComplete="off"
                                value={apiToken}
                                onChange={(e) => setApiToken(e.target.value)}
                                placeholder={settings.tokenLast4 ? `•••• ${settings.tokenLast4}` : "Paste the token from NextSMS"}
                            />
                            <FieldDescription>
                                {settings.configured
                                    ? "Leave blank to keep the current token."
                                    : "NextSMS dashboard: Customer Profile, Customization, API Keys."}
                            </FieldDescription>
                        </FieldContent>
                    </Field>
                    <FieldError errors={error ? [{message: error}] : undefined}/>
                </FieldGroup>
            </FieldSet>

            {settings.configured && balanceLine}

            {accountChanged && (
                <div role="alert" className="flex gap-2 rounded-lg border border-warning bg-warning/10 p-3 text-sm">
                    <TriangleAlertIcon className="size-4 shrink-0 text-warning"/>
                    <p>
                        You connected a different NextSMS account. Paste the webhook URL and verify token below into
                        the new account too, or delivery reports will stop arriving.
                    </p>
                </div>
            )}

            {settings.webhookUrl && settings.verifyToken && (
                <div className="space-y-3 rounded-lg bg-muted/50 p-4">
                    <div>
                        <h3 className="text-sm font-medium">Delivery reports</h3>
                        <p className="text-sm text-muted-foreground">
                            In the NextSMS dashboard, open Customer Profile, Customization, Webhooks, and paste both
                            values below.
                        </p>
                    </div>
                    <CopyField id="smsWebhookUrl" label="Webhook URL" value={settings.webhookUrl}/>
                    <CopyField id="smsVerifyToken" label="Verify token" value={settings.verifyToken}/>
                </div>
            )}

            <div className="flex justify-end border-t pt-4">
                <Button type="button" onClick={handleSave} disabled={save.isPending}>
                    {save.isPending ? "Checking with NextSMS..." : "Save SMS settings"}
                </Button>
            </div>
        </div>
    )
}
