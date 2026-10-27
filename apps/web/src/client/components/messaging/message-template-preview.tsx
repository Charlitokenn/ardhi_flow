import {useEffect, useMemo, useState} from "react"
import {useAuth} from "@clerk/react"
import {useQuery} from "@tanstack/react-query"
import {apiClient} from "@/lib/api.ts"
import {Button} from "@/components/ui/button.tsx"
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover.tsx"
import {Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList} from "@/components/ui/command.tsx"
import {Badge} from "@/components/reui/badge.tsx"
import {CheckIcon, ChevronsUpDownIcon, LoaderIcon} from "lucide-react"
import {cn} from "@/lib/utils.ts"
import type {ReminderTiming} from "@/components/forms/messaging/message-template-form.tsx"

interface MessageTemplatePreviewProps {
    body: string
    reminderTiming: ReminderTiming | null
}

// Renders a template body against one real, chosen client (spec AC-5), or
// the worker's fixed sample client until one is picked (AC-7), with its
// character and SMS segment count. Shared by the editor, which
// passes the draft as the admin types (AC-7), and the grid's read only
// Preview sheet, which passes a saved template and is open to any staff
// member.
export function MessageTemplatePreview({body, reminderTiming}: MessageTemplatePreviewProps) {
    const {getToken} = useAuth()
    const api = apiClient(getToken)

    // Debounced so the preview doesn't re-render on every keystroke.
    const [debouncedBody, setDebouncedBody] = useState(body)
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedBody(body), 400)
        return () => clearTimeout(timer)
    }, [body])

    const [pickerOpen, setPickerOpen] = useState(false)
    const [contactId, setContactId] = useState<string | null>(null)
    const [contactName, setContactName] = useState<string>("")

    const contactsQuery = useQuery({
        queryKey: ["contacts"],
        queryFn: async () => {
            const res = await api.api.contacts.$get()
            if (!res.ok) throw new Error(`Failed to load contacts (${res.status})`)
            return res.json()
        },
        enabled: pickerOpen,
    })

    const needsTiming = debouncedBody.includes("{dueItems}")

    const previewQuery = useQuery({
        queryKey: ["message-template-preview", debouncedBody, reminderTiming, contactId],
        queryFn: async () => {
            // No client picked yet → omit contactId and the worker renders
            // against its fixed sample client (AC-7).
            const res = await api.api["message-templates"].preview.$post({
                json: {...(contactId ? {contactId} : {}), body: debouncedBody, reminderTiming},
            })
            if (!res.ok) {
                const errBody: unknown = await res.json().catch(() => null)
                const message = (errBody && typeof errBody === "object" && "error" in errBody
                    ? (errBody as {error?: string}).error : null) ?? "Failed to render preview"
                throw new Error(message)
            }
            return res.json()
        },
    })

    const filteredContacts = useMemo(() => {
        return (contactsQuery.data ?? []).filter((c) => !c.isDeleted)
    }, [contactsQuery.data])

    return (
        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Preview</span>
                <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                    <PopoverTrigger asChild>
                        <Button type="button" variant="outline" size="sm" className="gap-1.5">
                            {contactName || "Sample client (James)"}
                            <ChevronsUpDownIcon className="size-3.5 text-muted-foreground"/>
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-0" align="end">
                        <Command>
                            <CommandInput placeholder="Search clients..."/>
                            <CommandList>
                                <CommandEmpty>
                                    {contactsQuery.isLoading ? "Loading..." : "No client found."}
                                </CommandEmpty>
                                <CommandGroup>
                                    {filteredContacts.map((c) => (
                                        <CommandItem
                                            key={c.id}
                                            value={c.fullName}
                                            onSelect={() => {
                                                setContactId(c.id)
                                                setContactName(c.fullName)
                                                setPickerOpen(false)
                                            }}
                                        >
                                            <CheckIcon
                                                className={cn(
                                                    "size-3.5",
                                                    contactId === c.id ? "opacity-100" : "opacity-0",
                                                )}
                                            />
                                            {c.fullName}
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>
            </div>

            {previewQuery.isFetching && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <LoaderIcon className="size-3.5 animate-spin"/> Rendering...
                </div>
            )}
            {previewQuery.isError && (
                <p className="text-sm text-destructive">{(previewQuery.error as Error).message}</p>
            )}
            {previewQuery.data && !previewQuery.isFetching && (
                <>
                    <p className="whitespace-pre-wrap rounded-md bg-background border p-3 text-sm">
                        {previewQuery.data.text || "Nothing typed yet."}
                    </p>
                    {/* AC-11's note is for a real client only, never the sample. */}
                    {contactId && previewQuery.data.dueItemsFound === 0 && needsTiming && (
                        <p className="text-xs text-amber-600">
                            Nothing due for this client in this timing right now.
                        </p>
                    )}
                </>
            )}

            {previewQuery.data && (
                <div className="flex items-center gap-2">
                    <Badge variant="secondary">{previewQuery.data.charCount} characters</Badge>
                    <Badge variant="secondary">{previewQuery.data.segmentCount} SMS segment(s)</Badge>
                </div>
            )}
        </div>
    )
}
