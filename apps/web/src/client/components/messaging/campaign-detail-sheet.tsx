import {useState} from "react"
import {useAuth} from "@clerk/react"
import {useQuery} from "@tanstack/react-query"
import {SMS_SKIP_REASON_LABELS, SMS_SKIP_REASONS} from "@ardhiflow/shared-schema"
import {apiClient} from "@/lib/api.ts"
import {formatDateTimeShort} from "@/lib/utils.ts"
import {Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle} from "@/components/ui/sheet.tsx"
import {Badge} from "@/components/reui/badge.tsx"
import {Button} from "@/components/ui/button.tsx"
import {Skeleton} from "@/components/ui/skeleton.tsx"

const STATUS_VARIANT: Record<string, "secondary" | "default" | "destructive" | "outline"> = {
    QUEUED: "outline",
    SENT: "secondary",
    DELIVERED: "default",
    FAILED: "destructive",
    UNDELIVERED: "destructive",
    EXPIRED: "outline",
}

interface CampaignDetailSheetProps {
    campaignId: string | null
    onClose: () => void
}

// A sent (or sending, or failed) campaign's results (docs/specs/0004-sms-send-flow
// AC-17). "Sent" means accepted by NextSMS, the same meaning as the dashboard
// grid. Refreshes while the campaign is still SENDING.
export function CampaignDetailSheet({campaignId, onClose}: CampaignDetailSheetProps) {
    const {getToken} = useAuth()
    const api = apiClient(getToken)
    const [page, setPage] = useState(1)

    const detailQuery = useQuery({
        queryKey: ["campaign-detail", campaignId, page],
        enabled: !!campaignId,
        queryFn: async () => {
            const res = await api.api.campaigns[":id"].$get({
                param: {id: campaignId!},
                query: {page: String(page)},
            })
            if (!res.ok) throw new Error(`Failed to load the campaign (${res.status})`)
            return res.json()
        },
        refetchInterval: (query) => (query.state.data?.campaign.status === "SENDING" ? 10_000 : false),
    })
    const detail = detailQuery.data
    const pageCount = detail ? Math.max(1, Math.ceil(detail.totalMessages / detail.pageSize)) : 1

    return (
        <Sheet
            open={!!campaignId}
            onOpenChange={(open) => {
                if (!open) {
                    setPage(1)
                    onClose()
                }
            }}
        >
            <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
                <SheetHeader>
                    <SheetTitle>{detail?.campaign.name ?? "Campaign"}</SheetTitle>
                    <SheetDescription>
                        {detail ? (
                            <>
                                <Badge variant={STATUS_VARIANT[detail.campaign.status] ?? "secondary"} size="sm">
                                    {detail.campaign.status}
                                </Badge>{" "}
                                {detail.campaign.sentAt && <>Sent {formatDateTimeShort(detail.campaign.sentAt)}</>}
                                {detail.campaign.senderId && <> as {detail.campaign.senderId}</>}
                            </>
                        ) : " "}
                    </SheetDescription>
                </SheetHeader>

                <div className="space-y-6 px-4 pb-6">
                    {detailQuery.isLoading && <Skeleton className="h-24 w-full"/>}
                    {detailQuery.isError && (
                        <p className="text-sm text-destructive">{(detailQuery.error as Error).message}</p>
                    )}

                    {detail && (
                        <>
                            <dl className="grid grid-cols-3 gap-3 text-center">
                                {([
                                    ["Sent", detail.summary.sent],
                                    ["Delivered", detail.summary.delivered],
                                    ["Failed", detail.summary.failed],
                                ] as const).map(([label, value]) => (
                                    <div key={label} className="rounded-lg border p-3">
                                        <dt className="text-xs text-muted-foreground">{label}</dt>
                                        <dd className="text-xl font-semibold">{value.toLocaleString()}</dd>
                                    </div>
                                ))}
                            </dl>

                            <div className="text-sm text-muted-foreground">
                                <p>
                                    Still queued: {detail.counts.queued} · Not delivered: {detail.counts.undelivered}
                                    {" "}· No report: {detail.counts.expired}
                                </p>
                                <p className="mt-1">
                                    Skipped:{" "}
                                    {detail.skipped
                                        ? SMS_SKIP_REASONS.map((reason) => `${SMS_SKIP_REASON_LABELS[reason]} ${detail.skipped![reason]}`).join(" · ")
                                        : "—"}
                                </p>
                            </div>

                            <div className="space-y-2">
                                <h3 className="text-sm font-medium">Recipients ({detail.totalMessages.toLocaleString()})</h3>
                                <ul className="divide-y rounded-lg border text-sm">
                                    {detail.messages.length === 0 && (
                                        <li className="p-3 text-muted-foreground">No messages yet.</li>
                                    )}
                                    {detail.messages.map((m) => (
                                        <li key={m.id} className="space-y-1 px-3 py-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="truncate font-medium">{m.contactName ?? "Removed contact"}</span>
                                                <Badge variant={STATUS_VARIANT[m.status] ?? "secondary"} size="sm">{m.status}</Badge>
                                            </div>
                                            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                                <span className="font-mono">+{m.phoneNumber}</span>
                                                <span>
                                                    {m.deliveredAt
                                                        ? `Delivered ${formatDateTimeShort(m.deliveredAt)}`
                                                        : m.sentAt ? `Sent ${formatDateTimeShort(m.sentAt)}` : "—"}
                                                </span>
                                            </div>
                                            {m.errorReason && <p className="text-xs text-destructive">{m.errorReason}</p>}
                                        </li>
                                    ))}
                                </ul>
                                {pageCount > 1 && (
                                    <div className="flex items-center justify-between text-sm">
                                        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                                            Previous
                                        </Button>
                                        <span className="text-muted-foreground">Page {page} of {pageCount}</span>
                                        <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
                                            Next
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    )
}
