import {useState} from "react"
import {useAuth} from "@clerk/react"
import {useMutation, useQueryClient} from "@tanstack/react-query"
import {toast} from "sonner"
import {apiClient} from "@/lib/api.ts"
import {Button} from "@/components/ui/button.tsx"
import {Input} from "@/components/ui/input.tsx"
import {Textarea} from "@/components/ui/textarea.tsx"
import {Field, FieldContent, FieldError, FieldGroup, FieldLabel} from "@/components/ui/field.tsx"
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select.tsx"
import {useSheetControl} from "@/components-reusable/reusable-sheet.tsx"
import {MessageTemplatePreview} from "@/components/messaging/message-template-preview.tsx"

type Category = "PAYMENT_REMINDER" | "OVERDUE_NOTICE" | "FULLY_PAID_THANKYOU" | "MARKETING" | "GENERAL" | "CUSTOM"
export type ReminderTiming = "UPCOMING" | "DUE_TODAY" | "PAST_DUE"
type Channel = "SMS" | "WHATSAPP"

const CATEGORY_OPTIONS: {value: Category; label: string}[] = [
    {value: "PAYMENT_REMINDER", label: "Payment reminder"},
    {value: "OVERDUE_NOTICE", label: "Overdue notice"},
    {value: "FULLY_PAID_THANKYOU", label: "Thank you (fully paid)"},
    {value: "MARKETING", label: "Marketing"},
    {value: "GENERAL", label: "General"},
    {value: "CUSTOM", label: "Custom"},
]

const TIMING_OPTIONS: {value: ReminderTiming; label: string}[] = [
    {value: "UPCOMING", label: "Upcoming"},
    {value: "DUE_TODAY", label: "Due today"},
    {value: "PAST_DUE", label: "Past due"},
]

const NO_TIMING = "__none__" // sentinel — Radix Select rejects an empty string value

export interface MessageTemplateFormValues {
    id?: string
    name: string
    category: Category
    reminderTiming: ReminderTiming | null
    channel: Channel
    body: string
}

interface MessageTemplateFormProps {
    mode: "create" | "edit"
    template?: MessageTemplateFormValues
}

// A default template is never edited here — the datagrid only ever opens
// this form for a non-default row, or in "create" mode for a brand new one
// (see spec AC-3: a default's only route to customization is Duplicate).
export function MessageTemplateForm({mode, template}: MessageTemplateFormProps) {
    const {getToken} = useAuth()
    const queryClient = useQueryClient()
    const api = apiClient(getToken)
    const sheetControl = useSheetControl()

    const [name, setName] = useState(template?.name ?? "")
    const [category, setCategory] = useState<Category>(template?.category ?? "PAYMENT_REMINDER")
    const [reminderTiming, setReminderTiming] = useState<ReminderTiming | null>(template?.reminderTiming ?? null)
    const [channel, setChannel] = useState<Channel>(template?.channel ?? "SMS")
    const [body, setBody] = useState(template?.body ?? "")
    const [errors, setErrors] = useState<Record<string, string>>({})

    const needsTiming = body.includes("{dueItems}")

    const validate = (): boolean => {
        const next: Record<string, string> = {}
        if (!name.trim()) next.name = "Name is required"
        if (!body.trim()) next.body = "Body is required"
        if (body.includes("{dueItems}") && !reminderTiming) {
            next.reminderTiming = "Required when the body uses {dueItems}"
        }
        setErrors(next)
        return Object.keys(next).length === 0
    }

    const saveMutation = useMutation({
        mutationFn: async () => {
            const payload = {name: name.trim(), category, reminderTiming, channel, body}
            const res = mode === "create"
                ? await api.api["message-templates"].$post({json: payload})
                : await api.api["message-templates"][":id"].$patch({param: {id: template!.id!}, json: payload})
            if (!res.ok) {
                const errBody: unknown = await res.json().catch(() => null)
                const message = (errBody && typeof errBody === "object" && "error" in errBody
                    ? (errBody as {error?: string}).error : null) ?? "Failed to save template"
                throw new Error(message)
            }
            return res.json()
        },
        onSuccess: () => {
            queryClient.invalidateQueries({queryKey: ["message-templates"]})
            toast.success(mode === "create" ? "Template created" : "Template updated")
            sheetControl?.close()
        },
        onError: (error: Error) => toast.error(error.message),
    })

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!validate()) return
        saveMutation.mutate()
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <FieldGroup>
                <Field data-invalid={!!errors.name}>
                    <FieldLabel htmlFor="template-name">Name</FieldLabel>
                    <FieldContent>
                        <Input
                            id="template-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Past Due Payment Reminder"
                        />
                        {errors.name && <FieldError>{errors.name}</FieldError>}
                    </FieldContent>
                </Field>

                <div className="grid grid-cols-2 gap-4">
                    <Field>
                        <FieldLabel>Category</FieldLabel>
                        <FieldContent>
                            <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
                                <SelectTrigger className="w-full">
                                    <SelectValue/>
                                </SelectTrigger>
                                <SelectContent>
                                    {CATEGORY_OPTIONS.map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </FieldContent>
                    </Field>

                    <Field data-invalid={!!errors.reminderTiming}>
                        <FieldLabel>Timing {needsTiming && <span className="text-destructive">*</span>}</FieldLabel>
                        <FieldContent>
                            <Select
                                value={reminderTiming ?? NO_TIMING}
                                onValueChange={(v) => setReminderTiming(v === NO_TIMING ? null : v as ReminderTiming)}
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="No timing"/>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NO_TIMING}>No timing</SelectItem>
                                    {TIMING_OPTIONS.map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {errors.reminderTiming && <FieldError>{errors.reminderTiming}</FieldError>}
                            {!errors.reminderTiming && (
                                <p className="text-xs text-muted-foreground">
                                    Required only if the body below uses <code>{"{dueItems}"}</code>.
                                </p>
                            )}
                        </FieldContent>
                    </Field>
                </div>

                <Field>
                    <FieldLabel>Channel</FieldLabel>
                    <FieldContent>
                        <Select value={channel} onValueChange={(v) => setChannel(v as Channel)}>
                            <SelectTrigger className="w-full">
                                <SelectValue/>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="SMS">SMS</SelectItem>
                                <SelectItem value="WHATSAPP">WhatsApp (not yet sendable)</SelectItem>
                            </SelectContent>
                        </Select>
                    </FieldContent>
                </Field>

                <Field data-invalid={!!errors.body}>
                    <FieldLabel htmlFor="template-body">Message</FieldLabel>
                    <FieldContent>
                        <Textarea
                            id="template-body"
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            rows={6}
                            placeholder="Habari {firstName}, {dueItems} Tafadhali fanya malipo kwa wakati..."
                            className="font-mono text-sm"
                        />
                        {errors.body && <FieldError>{errors.body}</FieldError>}
                        <p className="text-xs text-muted-foreground">
                            Tokens: <code>{"{firstName}"}</code>, <code>{"{dueItems}"}</code>, <code>{"{totalAmount}"}</code>
                        </p>
                    </FieldContent>
                </Field>
            </FieldGroup>

            <MessageTemplatePreview body={body} reminderTiming={reminderTiming}/>

            <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => sheetControl?.close()}>
                    Cancel
                </Button>
                <Button type="submit" disabled={saveMutation.isPending}>
                    {saveMutation.isPending ? "Saving..." : mode === "create" ? "Create template" : "Save changes"}
                </Button>
            </div>
        </form>
    )
}
