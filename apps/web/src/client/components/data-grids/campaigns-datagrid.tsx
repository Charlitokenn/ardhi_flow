"use client"

// See the identical note in commission-payments-datagrid.tsx: each
// DataGridColumnHeader reads sort state through builder calls React
// Compiler can't trace, so this file opts out entirely.
"use no memo"

import {useCallback, useMemo, useState} from "react"
import {useAuth} from "@clerk/react"
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query"
import {toast} from "sonner"
import {
    DataGrid,
    DataGridContainer,
    dataGridFeatures,
    type DataGridFeatures,
} from "@/components/reui/data-grid/data-grid.tsx"
import {DataGridPagination} from "@/components/reui/data-grid/data-grid-pagination.tsx"
import {DataGridScrollArea} from "@/components/reui/data-grid/data-grid-scroll-area.tsx"
import {DataGridTable} from "@/components/reui/data-grid/data-grid-table.tsx"
import {type ColumnDef, type PaginationState, type SortingState, useTable} from "@tanstack/react-table"
import {Card, CardAction, CardHeader} from "@/components/ui/card.tsx"
import {Badge} from "@/components/reui/badge.tsx"
import {Button} from "@/components/ui/button.tsx"
import {Tabs, TabsList, TabsTrigger} from "@/components/ui/tabs.tsx"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx"
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog.tsx"
import {Skeleton} from "@/components/ui/skeleton.tsx"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx"
import {type DraftRow, EMPTY_AUDIENCE} from "@/components/messaging/compose-campaign.ts"
import {CampaignDetailSheet} from "@/components/messaging/campaign-detail-sheet.tsx"
import {apiClient} from "@/lib/api.ts"
import {formatDateTimeShort} from "@/lib/utils.ts"
import {type ExportColumn, exportToCSV} from "@/lib/export-csv.ts"
import {
    ArrowDownAZIcon,
    ArrowUpAZIcon,
    CopyIcon,
    DownloadIcon,
    EyeIcon,
    MoreHorizontalIcon,
    PlusIcon,
    SquarePenIcon,
    Trash2Icon,
} from "lucide-react"

interface CampaignRow {
    id: string
    name: string
    type: string
    status: string
    recipientCount: number
    templateBody: string
    sentCount: number
    deliveredCount: number
    createdAt: string | null
    // Present from spec 0004 on; what the compose flow needs to reopen a draft.
    templateId?: string | null
    audience?: DraftRow["audience"]
}

interface CampaignsDataGridProps {
    onCreateNew: () => void
    // Opens a DRAFT in the compose flow (docs/specs/0004-sms-send-flow AC-5, AC-17).
    onOpenDraft?: (row: DraftRow) => void
}

const TYPE_LABELS: Record<string, string> = {
    PAYMENT_REMINDER: "Payment reminder",
    OVERDUE_NOTICE: "Overdue notice",
    FULLY_PAID_THANKYOU: "Thank you",
    MARKETING: "Marketing",
    GENERAL: "General",
    CUSTOM: "Custom",
}

const STATUS_VARIANT: Record<string, "secondary" | "default" | "destructive" | "outline"> = {
    DRAFT: "secondary",
    SCHEDULED: "outline",
    SENDING: "default",
    SENT: "default",
    FAILED: "destructive",
}

// Only what the reference image's filter tabs show (All/Sent/Draft/Scheduled)
// — SENDING and FAILED campaigns still appear under "All", just without
// their own tab, since nothing can produce them yet either.
const STATUS_TABS = [
    {value: "ALL", label: "All"},
    {value: "SENT", label: "Sent"},
    {value: "DRAFT", label: "Draft"},
    {value: "SCHEDULED", label: "Scheduled"},
] as const
type StatusTab = (typeof STATUS_TABS)[number]["value"]

// Drafts can be edited and deleted (docs/specs/0004-sms-send-flow AC-5).
// Opening a sent campaign's detail, and duplicating, come later in the same
// spec; until then this gives honest feedback instead of a dead button.
function notAvailableYet() {
    toast.info("Not available yet — coming with the send flow")
}

const exportColumns: ExportColumn<CampaignRow>[] = [
    {header: "Name", accessor: (row) => row.name},
    {header: "Type", accessor: (row) => TYPE_LABELS[row.type] ?? row.type},
    {header: "Status", accessor: (row) => row.status},
    {header: "Recipients", accessor: (row) => row.recipientCount},
    {header: "Sent", accessor: (row) => row.sentCount},
    {header: "Delivered", accessor: (row) => row.deliveredCount},
    {header: "Created", accessor: (row) => (row.createdAt ? formatDateTimeShort(row.createdAt) : "")},
]

function CampaignsEmptyState({onCreateNew}: { onCreateNew: () => void }) {
    return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
            <h3 className="text-lg font-semibold text-foreground">Welcome to your campaigns</h3>
            <p className="mt-1 text-sm text-muted-foreground">You haven&apos;t created any campaigns yet.</p>
            <p className="text-sm text-muted-foreground">
                Create campaigns to send bulk messages and track their performance.
            </p>
            <Button onClick={onCreateNew} className="mt-4 gap-1.5">
                <PlusIcon className="size-4"/> Create Your First Campaign
            </Button>
        </div>
    )
}

export function CampaignsDataGrid({onCreateNew, onOpenDraft}: CampaignsDataGridProps) {
    const {getToken} = useAuth()
    const api = apiClient(getToken)
    const queryClient = useQueryClient()
    const [deleteCandidate, setDeleteCandidate] = useState<CampaignRow | null>(null)
    const [detailId, setDetailId] = useState<string | null>(null)

    const deleteDraft = useMutation({
        mutationFn: async (id: string) => {
            const res = await api.api.campaigns[":id"].$delete({param: {id}})
            if (!res.ok) {
                const body: unknown = await res.json().catch(() => null)
                const message = body && typeof body === "object" && "message" in body
                    ? String((body as {message: unknown}).message) : "Could not delete the draft"
                throw new Error(message)
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({queryKey: ["campaigns"]})
            toast.success("Draft deleted")
        },
        onError: (error) => toast.error(error.message),
        onSettled: () => setDeleteCandidate(null),
    })

    const openDraft = useCallback((row: CampaignRow) => {
        if (row.status !== "DRAFT" || !onOpenDraft) {
            notAvailableYet()
            return
        }
        onOpenDraft({
            id: row.id,
            name: row.name,
            type: row.type,
            templateId: row.templateId ?? null,
            templateBody: row.templateBody,
            audience: row.audience ?? EMPTY_AUDIENCE,
        })
    }, [onOpenDraft])

    // AC-17: a draft reopens in the compose flow, anything already sending or
    // sent opens its detail sheet.
    const openCampaign = useCallback((row: CampaignRow) => {
        if (row.status === "DRAFT") openDraft(row)
        else setDetailId(row.id)
    }, [openDraft])

    const [sorting, setSorting] = useState<SortingState>([{id: "createdAt", desc: true}])
    const [pagination, setPagination] = useState<PaginationState>({pageIndex: 0, pageSize: 10})
    const [statusTab, setStatusTab] = useState<StatusTab>("ALL")
    const [previewCampaign, setPreviewCampaign] = useState<CampaignRow | null>(null)

    const campaignsQuery = useQuery({
        queryKey: ["campaigns"],
        queryFn: async () => {
            const res = await api.api.campaigns.$get()
            if (!res.ok) throw new Error(`Failed to load campaigns (${res.status})`)
            return res.json() as Promise<CampaignRow[]>
        },
    })

    const allRows = useMemo(() => campaignsQuery.data ?? [], [campaignsQuery.data])

    const tabCounts = useMemo(() => {
        const counts: Record<StatusTab, number> = {ALL: allRows.length, DRAFT: 0, SCHEDULED: 0, SENT: 0}
        for (const row of allRows) {
            if (row.status === "DRAFT") counts.DRAFT += 1
            if (row.status === "SCHEDULED") counts.SCHEDULED += 1
            if (row.status === "SENT") counts.SENT += 1
        }
        return counts
    }, [allRows])

    const isLatestFirst = sorting[0]?.desc !== false

    // Ordered here, not by the table: TanStack drops a sort entry whose id
    // isn't a sortable column, and there is no createdAt column. Campaigns
    // with no createdAt go last either way.
    const rows = useMemo(() => {
        const filtered = statusTab === "ALL" ? allRows : allRows.filter((row) => row.status === statusTab)
        const time = (row: CampaignRow) => (row.createdAt ? new Date(row.createdAt).getTime() : null)
        return [...filtered].sort((a, b) => {
            const ta = time(a)
            const tb = time(b)
            if (ta === null || tb === null) return ta === tb ? 0 : ta === null ? 1 : -1
            return isLatestFirst ? tb - ta : ta - tb
        })
    }, [allRows, statusTab, isLatestFirst])

    const toggleSortOrder = () => setSorting([{id: "createdAt", desc: !isLatestFirst}])

    const columns = useMemo<ColumnDef<DataGridFeatures, CampaignRow>[]>(
        () => [
            {
                accessorKey: "name",
                id: "name",
                header: "Notification",
                cell: (info) => {
                    const row = info.row.original
                    return (
                        <div className="space-y-1 py-1">
                            <button
                                type="button"
                                onClick={() => openCampaign(row)}
                                className="font-medium hover:underline text-left"
                            >
                                {row.name}
                            </button>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Badge variant={STATUS_VARIANT[row.status] ?? "secondary"} size="sm">
                                    {row.status}
                                </Badge>
                                <span>{TYPE_LABELS[row.type] ?? row.type}</span>
                                {row.createdAt && <span>{formatDateTimeShort(row.createdAt)}</span>}
                            </div>
                        </div>
                    )
                },
                enableSorting: false,
                size: 300,
            },
            {
                accessorKey: "recipientCount",
                id: "recipientCount",
                header: "Recipients",
                cell: (info) => (
                    <div className="text-center">
                        <div className="font-semibold">{info.row.original.recipientCount}</div>
                        <div className="text-xs text-muted-foreground">recipients</div>
                    </div>
                ),
                enableSorting: false,
                size: 90,
            },
            {
                accessorKey: "sentCount",
                id: "sentCount",
                header: "Sent",
                cell: (info) => (
                    <div className="text-center">
                        <div className="font-semibold">{info.row.original.sentCount}</div>
                        <div className="text-xs text-muted-foreground">sent</div>
                    </div>
                ),
                enableSorting: false,
                size: 90,
            },
            {
                accessorKey: "deliveredCount",
                id: "deliveredCount",
                header: "Delivered",
                cell: (info) => (
                    <div className="text-center">
                        <div className="font-semibold">{info.row.original.deliveredCount}</div>
                        <div className="text-xs text-muted-foreground">delivered</div>
                    </div>
                ),
                enableSorting: false,
                size: 90,
            },
            {
                id: "actions",
                header: "",
                cell: (info) => {
                    const row = info.row.original
                    return (
                        <div className="flex items-center justify-end gap-1">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${row.name}`}>
                                        <MoreHorizontalIcon className="size-4"/>
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onSelect={() => openDraft(row)}>
                                        <SquarePenIcon className="size-4"/> Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => exportToCSV([row], exportColumns, row.name)}>
                                        <DownloadIcon className="size-4"/> Export Data
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator/>
                                    <DropdownMenuItem
                                        variant="destructive"
                                        onSelect={() => (row.status === "DRAFT" ? setDeleteCandidate(row) : notAvailableYet())}
                                    >
                                        <Trash2Icon className="size-4"/> Delete
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                aria-label={`Preview ${row.name}`}
                                onClick={() => setPreviewCampaign(row)}
                            >
                                <EyeIcon className="size-4"/>
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                aria-label={`Duplicate ${row.name}`}
                                onClick={notAvailableYet}
                            >
                                <CopyIcon className="size-4"/>
                            </Button>
                        </div>
                    )
                },
                enableSorting: false,
                size: 130,
            },
        ],
        [openDraft, openCampaign],
    )

    const table = useTable({
        features: dataGridFeatures,
        data: rows,
        columns,
        pageCount: Math.max(1, Math.ceil(rows.length / pagination.pageSize)),
        state: {sorting, pagination},
        onSortingChange: setSorting,
        onPaginationChange: setPagination,
        getRowId: (row: CampaignRow) => row.id,
    })

    // The big "create your first campaign" state only applies when there is
    // truly nothing yet; filtering an existing list down to zero rows gets a
    // lighter message instead.
    const emptyMessage =
        allRows.length === 0 ? (
            <CampaignsEmptyState onCreateNew={onCreateNew}/>
        ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">
                No campaigns match this filter.
            </p>
        )

    return (
        <>
            <DataGrid
                table={table}
                recordCount={rows.length}
                isLoading={campaignsQuery.isLoading}
                emptyMessage={emptyMessage}
            >
                <div className="w-full space-y-2.5">
                    <Card className="p-0">
                        <CardHeader className="flex items-center justify-between px-3.5 py-2">
                            <Tabs value={statusTab} onValueChange={(v) => setStatusTab(v as StatusTab)}>
                                <TabsList>
                                    {STATUS_TABS.map((tab) => (
                                        <TabsTrigger key={tab.value} value={tab.value}>
                                            {tab.label} {tabCounts[tab.value]}
                                        </TabsTrigger>
                                    ))}
                                </TabsList>
                            </Tabs>
                            <CardAction className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground">{rows.length} items</span>
                                <Button variant="outline" size="sm" className="gap-1.5" onClick={toggleSortOrder}>
                                    {isLatestFirst ? (
                                        <ArrowDownAZIcon className="size-3.5"/>
                                    ) : (
                                        <ArrowUpAZIcon className="size-3.5"/>
                                    )}
                                    {isLatestFirst ? "Latest Created" : "Oldest Created"}
                                </Button>
                            </CardAction>
                        </CardHeader>
                        {campaignsQuery.isLoading ? (
                            <div className="space-y-2 p-4">
                                <Skeleton className="h-10 w-full"/>
                                <Skeleton className="h-10 w-full"/>
                                <Skeleton className="h-10 w-full"/>
                            </div>
                        ) : (
                            <DataGridContainer>
                                <DataGridScrollArea>
                                    <DataGridTable/>
                                </DataGridScrollArea>
                            </DataGridContainer>
                        )}
                    </Card>
                    <DataGridPagination/>
                </div>
            </DataGrid>

            <Dialog open={!!previewCampaign} onOpenChange={(open) => !open && setPreviewCampaign(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{previewCampaign?.name}</DialogTitle>
                        <DialogDescription>
                            {previewCampaign && (TYPE_LABELS[previewCampaign.type] ?? previewCampaign.type)}
                            {" · "}
                            {previewCampaign?.recipientCount} recipient(s)
                        </DialogDescription>
                    </DialogHeader>
                    <p className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm">
                        {previewCampaign?.templateBody}
                    </p>
                </DialogContent>
            </Dialog>

            <CampaignDetailSheet campaignId={detailId} onClose={() => setDetailId(null)}/>

            <AlertDialog open={!!deleteCandidate} onOpenChange={(open) => !open && setDeleteCandidate(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
                        <AlertDialogDescription>
                            "{deleteCandidate?.name}" will no longer appear on the dashboard. Nothing was sent.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep it</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => deleteCandidate && deleteDraft.mutate(deleteCandidate.id)}
                            disabled={deleteDraft.isPending}
                        >
                            Delete draft
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
