"use client"

// See the identical note in commission-payments-datagrid.tsx and
// plots-held-datagrid.tsx: the expand toggle and each DataGridColumnHeader
// read table state through builder calls React Compiler can't trace, so
// this file opts out entirely.
"use no memo"

import {useEffect, useMemo, useState} from "react"
import {useAuth} from "@clerk/react"
import {useQuery} from "@tanstack/react-query"
import {apiClient} from "@/lib/api.ts"
import {toast} from "sonner"
import {Badge} from "@/components/reui/badge.tsx"
import {
    DataGrid,
    DataGridContainer,
    dataGridFeatures,
    type DataGridFeatures,
} from "@/components/reui/data-grid/data-grid.tsx"
import {DataGridColumnHeader} from "@/components/reui/data-grid/data-grid-column-header.tsx"
import {DataGridPagination} from "@/components/reui/data-grid/data-grid-pagination.tsx"
import {DataGridScrollArea} from "@/components/reui/data-grid/data-grid-scroll-area.tsx"
import {
    DataGridTable,
    DataGridTableFootRow,
    DataGridTableFootRowCell,
    DataGridTableRowSelect,
    DataGridTableRowSelectAll,
} from "@/components/reui/data-grid/data-grid-table.tsx"
import {
    type ColumnDef,
    type ColumnPinningState,
    type ExpandedState,
    type PaginationState,
    type RowSelectionState,
    type SortingState,
    useTable,
} from "@tanstack/react-table"

import {Avatar, AvatarFallback} from "@/components/ui/avatar.tsx"
import {Button} from "@/components/ui/button.tsx"
import {Card, CardAction, CardContent, CardFooter, CardHeader,} from "@/components/ui/card.tsx"
import {Checkbox} from "@/components/ui/checkbox.tsx"
import {InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput,} from "@/components/ui/input-group.tsx"
import {Label} from "@/components/ui/label.tsx"
import {Popover, PopoverContent, PopoverTrigger,} from "@/components/ui/popover.tsx"
import {Skeleton} from "@/components/ui/skeleton.tsx"
import {thousandSeparator} from "@/lib/utils"
import type {ClientContactCommissionPayout, CommissionContractRow} from "../../../../../../packages/shared-schema"
import {ChevronDownIcon, ChevronUpIcon, FunnelIcon, SearchIcon, XIcon,} from "lucide-react"
import ReusableTooltip from "@/components-reusable/reusable-tooltip.tsx"
import {TableActionBar} from "@/components-reusable/reusable-table-action-bar.tsx"
import {useTableCSVExport} from "../../../../../../packages/api-client"
import {type ExportColumn} from "@/lib/export-csv.ts"
import {ReusableEmpty} from "@/components-reusable/reusable-empty.tsx"
import {WalletIcon} from "@/assets/icons"

// Columns for the "download selected" CSV export in the action bar — mirrors
// what's actually shown in the grid (top-level contract fields only, not
// the nested payout tranches), same convention as contacts-datagrid.tsx.
const exportColumns: ExportColumn<CommissionContractRow>[] = [
    {header: "Client", accessor: (d) => d.client?.fullName ?? ""},
    {header: "Project", accessor: (d) => d.project.projectName},
    {
        header: "Plot(s)",
        accessor: (d) =>
            d.plots.map((plot) => plot.surveyedPlotNumber ?? plot.plotNumber).join(", "),
    },
    {header: "Contract Value", accessor: (d) => d.totalContractValue},
    {header: "Commission %", accessor: (d) => d.commissionPercent},
    {header: "Commission Amount", accessor: (d) => d.commissionAmount},
    {header: "Contract Status", accessor: (d) => d.status},
    {
        header: "Commission Status",
        accessor: (d) => COMMISSION_STATUS_LABELS[commissionStatus(d.commissionPayouts)],
    },
    {header: "Sales Agent", accessor: (d) => d.salesAgent?.fullName ?? ""},
]

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function initials(name: string): string {
    return name
        .split(" ")
        .filter(Boolean)
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
}

function formatTzs(value: string): string {
    const numeric = Number(value)
    if (Number.isNaN(numeric)) return "—"
    return `Tshs. ${thousandSeparator(numeric)}`
}

/** `targetMonth`/`paidMonth` are calendar months (stored as the 1st of the
 * month), not specific days — shown as "Mon YYYY" rather than running them
 * through `formatDate`'s day-level format, which would misleadingly imply a
 * specific due/paid date. */
function formatMonth(date: string | null): string {
    if (!date) return "—"
    const d = new Date(date)
    if (Number.isNaN(d.getTime())) return "—"
    return d.toLocaleDateString("en-US", {month: "short", year: "numeric", timeZone: "UTC"})
}

/** Mirrors the contract status badge used in contracts-datagrid.tsx and
 * commission-payments-datagrid.tsx, kept local here since this grid only
 * ever needs it for the commissioned contracts it lists. */
function contractStatusBadge(status: CommissionContractRow["status"]) {
    switch (status) {
        case "ACTIVE":
            return (
                <ReusableTooltip
                    trigger={<Badge variant="success-outline">Active</Badge>}
                    tooltip="Contract is in good standing, with payments on schedule."
                />
            )
        case "DELINQUENT":
            return (
                <ReusableTooltip
                    trigger={<Badge variant="destructive-outline">Delinquent</Badge>}
                    tooltip="Contract has one or more overdue installments."
                />
            )
        case "COMPLETED":
            return (
                <ReusableTooltip
                    trigger={<Badge variant="info-outline">Completed</Badge>}
                    tooltip="Contract has been paid off in full."
                />
            )
        case "CANCELLED":
            return (
                <ReusableTooltip
                    trigger={<Badge variant="secondary">Cancelled</Badge>}
                    tooltip="Contract was cancelled before completion."
                />
            )
        default:
            return <Badge variant="secondary">{status}</Badge>
    }
}

function payoutStatusBadge(status: ClientContactCommissionPayout["status"]) {
    switch (status) {
        case "PAID":
            return (
                <ReusableTooltip
                    trigger={<Badge variant="success-light">Paid</Badge>}
                    tooltip="This commission has been released to the sales person."
                />
            )
        case "CANCELLED":
            return (
                <ReusableTooltip
                    trigger={<Badge variant="secondary">Cancelled</Badge>}
                    tooltip="This commission will not be paid out."
                />
            )
        case "PENDING":
        default:
            return (
                <ReusableTooltip
                    trigger={<Badge variant="warning-light">Pending</Badge>}
                    tooltip="This commission is scheduled but not yet released."
                />
            )
    }
}

type CommissionStatus = "FULLY_PAID" | "PARTIAL" | "UNPAID"

const COMMISSION_STATUS_LABELS: Record<CommissionStatus, string> = {
    FULLY_PAID: "Fully Paid",
    PARTIAL: "Partial",
    UNPAID: "Unpaid",
}

// Most-actionable first — a finance user opening this filter almost always
// wants to see what's still owed before what's already settled.
const COMMISSION_STATUS_ORDER: CommissionStatus[] = ["UNPAID", "PARTIAL", "FULLY_PAID"]

/** Whether a contract's commission has been fully paid out, partly paid, or
 * not paid at all yet — derived from its payout tranches rather than stored
 * directly. Cancelled tranches are excluded from the count: they'll never
 * be paid, and folding them in would make a contract whose every *real*
 * tranche is already paid read as merely "Partial". A contract with no
 * tranches at all (or only cancelled ones) reads as "Unpaid" — nothing has
 * been paid out, whatever the reason. */
function commissionStatus(payouts: ClientContactCommissionPayout[]): CommissionStatus {
    const relevant = payouts.filter((payout) => payout.status !== "CANCELLED")
    const paidCount = relevant.filter((payout) => payout.status === "PAID").length
    if (relevant.length === 0 || paidCount === 0) return "UNPAID"
    if (paidCount === relevant.length) return "FULLY_PAID"
    return "PARTIAL"
}

function commissionStatusBadge(status: CommissionStatus) {
    switch (status) {
        case "FULLY_PAID":
            return (
                <ReusableTooltip
                    trigger={<Badge variant="success-light">Fully Paid</Badge>}
                    tooltip="Every commission tranche on this contract has been paid out — nothing outstanding."
                />
            )
        case "PARTIAL":
            return (
                <ReusableTooltip
                    trigger={<Badge variant="warning-light">Partial</Badge>}
                    tooltip="Some commission tranches on this contract have been paid — others are still pending."
                />
            )
        case "UNPAID":
        default:
            return (
                <ReusableTooltip
                    trigger={<Badge variant="destructive-light">Unpaid</Badge>}
                    tooltip="None of this contract's commission tranches have been paid out yet."
                />
            )
    }
}

/** Layout for a totals footer row: how many visible columns sit before the
 * target column (the label spans those) and how many sit after (rendered
 * as one empty trailing cell) — derived from the table's actual visible
 * columns so the footer stays aligned under its target even if a column
 * between it and the table edge gets hidden. Returns null if the target
 * column itself is currently hidden, since there's nowhere to anchor the
 * total in that case. */
function footerColumnSpan(
    visibleColumnIds: string[],
    targetColumnId: string
): { leading: number; trailing: number } | null {
    const targetIndex = visibleColumnIds.indexOf(targetColumnId)
    if (targetIndex === -1) return null
    return {
        leading: targetIndex,
        trailing: visibleColumnIds.length - targetIndex - 1,
    }
}

// ---------------------------------------------------------------------------
// Sub-table: commission payout schedule for one contract
// ---------------------------------------------------------------------------

function CommissionPayoutsSubTable({
                                       payouts,
                                       payoutMonths,
                                   }: {
    payouts: ClientContactCommissionPayout[]
    /** The contract's `commissionPayoutMonths` — lets each row read as
     * "Tranche 1 of 3" instead of a bare number. */
    payoutMonths: number
}) {
    const [sorting, setSorting] = useState<SortingState>([
        {id: "trancheNumber", desc: false},
    ])
    const [pagination, setPagination] = useState<PaginationState>({
        pageIndex: 0,
        pageSize: 5,
    })

    const columns = useMemo<ColumnDef<DataGridFeatures, ClientContactCommissionPayout>[]>(
        () => [
            {
                accessorKey: "trancheNumber",
                id: "trancheNumber",
                header: ({column}) => (
                    <DataGridColumnHeader title="Tranche" column={column}/>
                ),
                cell: (info) => `Payment ${info.getValue() as number} of ${payoutMonths}`,
                enableSorting: true,
                size: 160,
            },
            {
                accessorKey: "targetMonth",
                id: "targetMonth",
                header: ({column}) => (
                    <DataGridColumnHeader title="Payout Month" column={column}/>
                ),
                cell: (info) => formatMonth(info.getValue() as string),
                enableSorting: true,
                size: 150,
            },
            {
                accessorKey: "amount",
                id: "amount",
                header: ({column}) => (
                    <DataGridColumnHeader title="Amount" column={column}/>
                ),
                cell: (info) => formatTzs(info.getValue() as string),
                enableSorting: true,
                size: 150,
            },
            {
                accessorKey: "status",
                id: "status",
                header: ({column}) => (
                    <DataGridColumnHeader title="Status" column={column}/>
                ),
                cell: ({row}) => payoutStatusBadge(row.original.status),
                enableSorting: true,
                size: 130,
            },
            {
                accessorKey: "paidMonth",
                id: "paidMonth",
                header: ({column}) => (
                    <DataGridColumnHeader title="Paid Month" column={column}/>
                ),
                cell: (info) => formatMonth(info.getValue() as string | null),
                enableSorting: true,
                size: 150,
            },
        ],
        [payoutMonths]
    )

    const table = useTable({
        features: dataGridFeatures,
        data: payouts,
        columns,
        pageCount: Math.max(1, Math.ceil(payouts.length / pagination.pageSize)),
        state: {
            sorting,
            pagination,
        },
        onSortingChange: setSorting,
        onPaginationChange: setPagination,
        getRowId: (row: ClientContactCommissionPayout) => row.id,
    })

    const totalPaid = useMemo(
        () =>
            payouts
                .filter((payout) => payout.status === "PAID")
                .reduce((sum, payout) => sum + Number(payout.amount), 0),
        [payouts]
    )

    const amountSpan = footerColumnSpan(
        table.getVisibleLeafColumns().map((column) => column.id),
        "amount"
    )

    const footer = amountSpan && (
        <DataGridTableFootRow>
            {amountSpan.leading > 0 && (
                <DataGridTableFootRowCell colSpan={amountSpan.leading}>
                    <span className="text-muted-foreground">Total Paid</span>
                </DataGridTableFootRowCell>
            )}
            <DataGridTableFootRowCell className="font-bold tabular-nums">
                {formatTzs(totalPaid.toString())}
            </DataGridTableFootRowCell>
            {amountSpan.trailing > 0 && (
                <DataGridTableFootRowCell colSpan={amountSpan.trailing}/>
            )}
        </DataGridTableFootRow>
    )

    return (
        <div className="bg-background min-w-0">
            <DataGrid
                table={table}
                recordCount={payouts.length}
                tableLayout={{
                    rowBorder: true,
                }}
                emptyMessage="No commission payouts have been scheduled for this contract yet."
            >
                <div className="w-full min-w-0 space-y-2.5 p-3 pl-12">
                    <Card className="p-0">
                        <DataGridContainer className="min-w-0">
                            <DataGridScrollArea className="min-w-0">
                                <DataGridTable footerContent={footer}/>
                            </DataGridScrollArea>
                        </DataGridContainer>
                    </Card>
                    <DataGridPagination className="pb-1.5"/>
                </div>
            </DataGrid>
        </div>
    )
}

// ---------------------------------------------------------------------------
// Main grid: every commissioned contract, across every sales agent
// ---------------------------------------------------------------------------

export function CommissionsDataGrid() {
    const {getToken} = useAuth()
    const api = apiClient(getToken)

    const [pagination, setPagination] = useState<PaginationState>({
        pageIndex: 0,
        pageSize: 8,
    })
    const [sorting, setSorting] = useState<SortingState>([])
    const [expandedRows, setExpandedRows] = useState<ExpandedState>({})
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
    // The contract identity (client/plot/project) is what makes any other
    // column on this row meaningful, so it — and the select/expand columns
    // right next to it — stay pinned as the grid scrolls horizontally. Still
    // a controlled state (not just an initial value) so the header's own
    // Pin/Unpin control can move it, same as any other pinned column.
    const [columnPinning, setColumnPinning] = useState<ColumnPinningState>({
        start: ["select", "expand", "contract"],
        end: [],
    })

    const [searchQuery, setSearchQuery] = useState("")
    const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([])
    const [selectedCommissionStatuses, setSelectedCommissionStatuses] = useState<
        CommissionStatus[]
    >([])

    const commissionsQuery = useQuery({
        queryKey: ["commissions"],
        queryFn: async () => {
            const res = await api.api.commissions.$get()
            if (!res.ok) {
                const body = await res.json().catch(() => null)
                const message =
                    (body && typeof body === "object" && "error" in body
                        ? (body as { error?: string }).error
                        : null) ?? `Failed to load commissions (${res.status})`
                throw new Error(message)
            }
            return res.json() as Promise<CommissionContractRow[]>
        },
    })

    useEffect(() => {
        if (commissionsQuery.isError) {
            toast.error(
                commissionsQuery.error instanceof Error
                    ? commissionsQuery.error.message
                    : "Failed to load commissions"
            )
        }
    }, [commissionsQuery.isError, commissionsQuery.error])

    const data = useMemo<CommissionContractRow[]>(
        () => commissionsQuery.data ?? [],
        [commissionsQuery.data]
    )

    // One entry per distinct sales agent found across every commissioned
    // contract (not just the currently filtered/searched set), each with
    // how many contracts they're attached to — powers the Sales Agent
    // filter popover below the same way contacts-datagrid.tsx's Type
    // filter is built from the full, unfiltered contact list.
    const agentCounts = useMemo(() => {
        const counts = new Map<string, { name: string; count: number }>()
        for (const contract of data) {
            if (!contract.salesAgent) continue
            const existing = counts.get(contract.salesAgent.id)
            if (existing) {
                existing.count += 1
            } else {
                counts.set(contract.salesAgent.id, {
                    name: contract.salesAgent.fullName,
                    count: 1,
                })
            }
        }
        return counts
    }, [data])

    const agentOptions = useMemo(
        () =>
            Array.from(agentCounts.entries())
                .map(([id, {name, count}]) => ({id, name, count}))
                .sort((a, b) => a.name.localeCompare(b.name)),
        [agentCounts]
    )

    // One entry per commission status found across every commissioned
    // contract (not just the currently filtered/searched set) — powers the
    // Commission Status filter popover the same way agentCounts powers the
    // Sales Agent one above.
    const commissionStatusCounts = useMemo(() => {
        const counts = new Map<CommissionStatus, number>()
        for (const contract of data) {
            const status = commissionStatus(contract.commissionPayouts)
            counts.set(status, (counts.get(status) ?? 0) + 1)
        }
        return counts
    }, [data])

    const handleAgentChange = (checked: boolean, agentId: string) => {
        setSelectedAgentIds((prev = []) =>
            checked ? [...prev, agentId] : prev.filter((id) => id !== agentId)
        )
    }

    const handleCommissionStatusChange = (checked: boolean, status: CommissionStatus) => {
        setSelectedCommissionStatuses((prev = []) =>
            checked ? [...prev, status] : prev.filter((s) => s !== status)
        )
    }

    const filteredData = useMemo(() => {
        return data.filter((contract) => {
            const matchesAgent =
                !selectedAgentIds.length ||
                (contract.salesAgent && selectedAgentIds.includes(contract.salesAgent.id))

            const rowCommissionStatus = commissionStatus(contract.commissionPayouts)
            const matchesCommissionStatus =
                !selectedCommissionStatuses.length ||
                selectedCommissionStatuses.includes(rowCommissionStatus)

            const searchLower = searchQuery.toLowerCase()
            const matchesSearch =
                !searchQuery ||
                [
                    contract.client?.fullName,
                    contract.project.projectName,
                    contract.plots
                        .map((plot) => plot.surveyedPlotNumber ?? plot.plotNumber)
                        .join(" "),
                    contract.salesAgent?.fullName,
                    contract.status,
                    contract.totalContractValue,
                    contract.commissionPercent,
                    contract.commissionAmount,
                    COMMISSION_STATUS_LABELS[rowCommissionStatus],
                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase()
                    .includes(searchLower)

            return matchesAgent && matchesCommissionStatus && matchesSearch
        })
    }, [data, searchQuery, selectedAgentIds, selectedCommissionStatuses])

    const hasActiveFilters =
        searchQuery.length > 0 ||
        selectedAgentIds.length > 0 ||
        selectedCommissionStatuses.length > 0

    const handleClearFilters = () => {
        setSearchQuery("")
        setSelectedAgentIds([])
        setSelectedCommissionStatuses([])
    }

    const columns = useMemo<ColumnDef<DataGridFeatures, CommissionContractRow>[]>(
        () => [
            {
                accessorKey: "id",
                id: "select",
                header: () => <DataGridTableRowSelectAll/>,
                cell: ({row}) => <DataGridTableRowSelect row={row}/>,
                enableSorting: false,
                enableHiding: false,
                size: 35,
                enableResizing: false,
                meta: {skeleton: <Skeleton className="h-4.5 w-4.5"/>},
            },
            {
                id: "expand",
                header: () => null,
                cell: ({row}) => {
                    return row.getCanExpand() ? (
                        <Button
                            type="button"
                            onClick={row.getToggleExpandedHandler()}
                            size="icon-sm"
                            variant="ghost"
                            className="opacity-70 hover:bg-transparent hover:opacity-100"
                            aria-label={
                                row.getIsExpanded()
                                    ? "Collapse commission payouts"
                                    : "Expand commission payouts"
                            }
                        >
                            {row.getIsExpanded() ? (
                                <ChevronUpIcon aria-hidden="true"/>
                            ) : (
                                <ChevronDownIcon aria-hidden="true"/>
                            )}
                        </Button>
                    ) : null
                },
                size: 45,
                enableResizing: false,
                meta: {
                    skeleton: <Skeleton className="size-7"/>,
                    expandedContent: (row) => (
                        <CommissionPayoutsSubTable
                            payouts={row.commissionPayouts}
                            payoutMonths={row.commissionPayoutMonths}
                        />
                    ),
                },
            },
            {
                id: "contract",
                header: ({column}) => (
                    <DataGridColumnHeader
                        title="Contract"
                        visibility={true}
                        column={column}
                    />
                ),
                cell: ({row}) => {
                    const clientName = row.original.client?.fullName ?? "—"
                    // A contract can cover more than one plot (always within
                    // one project — see plotSaleContracts.projectId), so this
                    // shows every live plot in the bucket, not just one.
                    const plotLabel = row.original.plots
                        .map((plot) => plot.surveyedPlotNumber ?? plot.plotNumber)
                        .join(", ") || "—"
                    return (
                        <div className="flex items-center gap-3">
                            <Avatar className="size-8">
                                <AvatarFallback>{initials(clientName)}</AvatarFallback>
                            </Avatar>
                            <div className="space-y-px">
                                <div className="text-foreground font-medium">{clientName}</div>
                                <div className="text-muted-foreground">
                                    Plot{row.original.plots.length === 1 ? "" : "s"} No. {plotLabel} · {row.original.project.projectName}
                                </div>
                            </div>
                        </div>
                    )
                },
                enableSorting: false,
                enableHiding: false,
                size: 260,
                meta: {
                    skeleton: (
                        <div className="flex items-center gap-3">
                            <Skeleton className="h-8 w-8 rounded-full"/>
                            <div className="flex flex-col gap-1">
                                <Skeleton className="h-6 w-48"/>
                                <Skeleton className="h-4 w-18 rounded-sm"/>
                            </div>
                        </div>
                    ),
                },
            },
            {
                accessorKey: "totalContractValue",
                id: "totalContractValue",
                header: ({column}) => (
                    <DataGridColumnHeader
                        title="Contract Value"
                        visibility={true}
                        column={column}
                    />
                ),
                cell: (info) => formatTzs(info.getValue() as string),
                enableSorting: true,
                enableHiding: true,
                size: 160,
                meta: {skeleton: <Skeleton className="h-7 w-auto"/>},
            },
            {
                accessorKey: "commissionPercent",
                id: "commissionPercent",
                header: ({column}) => (
                    <DataGridColumnHeader
                        title="Commission %"
                        visibility={true}
                        column={column}
                    />
                ),
                cell: (info) => `${info.getValue() as string}%`,
                enableSorting: true,
                enableHiding: true,
                size: 130,
                meta: {skeleton: <Skeleton className="h-7 w-auto"/>},
            },
            {
                accessorKey: "commissionAmount",
                id: "commissionAmount",
                header: ({column}) => (
                    <DataGridColumnHeader
                        title="Commission Amount"
                        visibility={true}
                        column={column}
                    />
                ),
                cell: (info) => formatTzs(info.getValue() as string),
                enableSorting: true,
                enableHiding: true,
                size: 180,
                meta: {skeleton: <Skeleton className="h-7 w-auto"/>},
            },
            {
                accessorKey: "status",
                id: "status",
                header: ({column}) => (
                    <DataGridColumnHeader
                        title="Contract Status"
                        visibility={true}
                        column={column}
                    />
                ),
                cell: ({row}) => contractStatusBadge(row.original.status),
                enableSorting: true,
                enableHiding: true,
                size: 130,
                meta: {skeleton: <Skeleton className="h-7 w-auto"/>},
            },
            // Whether every tranche is paid, some are, or none are —
            // derived from commissionPayouts (see commissionStatus above),
            // not a stored field, so it always reflects the payouts shown
            // in the row's own expanded sub-table.
            {
                id: "commissionStatus",
                accessorFn: (row) => commissionStatus(row.commissionPayouts),
                header: ({column}) => (
                    <DataGridColumnHeader
                        title="Commission Status"
                        visibility={true}
                        column={column}
                    />
                ),
                cell: ({row}) =>
                    commissionStatusBadge(commissionStatus(row.original.commissionPayouts)),
                enableSorting: true,
                enableHiding: true,
                size: 150,
                meta: {skeleton: <Skeleton className="h-7 w-auto"/>},
            },
            // Last column: who this commission belongs to. Unlike the
            // per-contact Commission Payments tab (commission-payments-
            // datagrid.tsx), this grid spans every agent, so every row has
            // to say whose commission it is.
            {
                id: "salesAgent",
                accessorFn: (row) => row.salesAgent?.fullName ?? "",
                header: ({column}) => (
                    <DataGridColumnHeader
                        title="Sales Agent"
                        visibility={true}
                        column={column}
                    />
                ),
                cell: ({row}) => {
                    const agentName = row.original.salesAgent?.fullName ?? "—"
                    if (!row.original.salesAgent) {
                        return <span className="text-muted-foreground">—</span>
                    }
                    return (
                        <div className="flex items-center gap-2.5">
                            <Avatar className="size-7">
                                <AvatarFallback>{initials(agentName)}</AvatarFallback>
                            </Avatar>
                            <span className="text-foreground font-medium">{agentName}</span>
                        </div>
                    )
                },
                enableSorting: true,
                enableHiding: true,
                size: 190,
                meta: {
                    skeleton: (
                        <div className="flex items-center gap-2.5">
                            <Skeleton className="h-7 w-7 rounded-full"/>
                            <Skeleton className="h-6 w-24"/>
                        </div>
                    ),
                },
            },
        ],
        []
    )

    const table = useTable({
        features: dataGridFeatures,
        columns,
        data: filteredData,
        pageCount: Math.max(1, Math.ceil(filteredData.length / pagination.pageSize)),
        getRowId: (row: CommissionContractRow) => row.id,
        getRowCanExpand: (row) => row.original.commissionPayouts.length > 0,
        enableRowSelection: true,
        state: {
            pagination,
            sorting,
            expanded: expandedRows,
            columnPinning,
            rowSelection,
        },
        onPaginationChange: setPagination,
        onSortingChange: setSorting,
        onExpandedChange: setExpandedRows,
        onColumnPinningChange: setColumnPinning,
        onRowSelectionChange: setRowSelection,
    })

    const {exportSelected} = useTableCSVExport(table, exportColumns)

    const totalCommission = filteredData
        .filter((contract) => contract.status !== "CANCELLED")
        .reduce((sum, contract) => sum + Number(contract.commissionAmount), 0)

    const commissionAmountSpan = footerColumnSpan(
        table.getVisibleLeafColumns().map((column) => column.id),
        "commissionAmount"
    )

    const footer = commissionAmountSpan && (
        <DataGridTableFootRow>
            {commissionAmountSpan.leading > 0 && (
                <DataGridTableFootRowCell colSpan={commissionAmountSpan.leading}>
                    <span className="text-muted-foreground">Total Commission Amount</span>
                </DataGridTableFootRowCell>
            )}
            <DataGridTableFootRowCell className="font-bold tabular-nums">
                {formatTzs(totalCommission.toString())}
            </DataGridTableFootRowCell>
            {commissionAmountSpan.trailing > 0 && (
                <DataGridTableFootRowCell colSpan={commissionAmountSpan.trailing}/>
            )}
        </DataGridTableFootRow>
    )

    return (
        <DataGrid
            table={table}
            recordCount={filteredData.length || 0}
            tableLayout={{
                columnsVisibility: true,
                columnsPinnable: true,
                columnsResizable: true,
                columnsMovable: true,
            }}
            isLoading={commissionsQuery.isLoading}
            emptyMessage={
                commissionsQuery.isError ? (
                    <ReusableEmpty
                        media={<WalletIcon className="size-12"/>}
                        title="Couldn't load commissions"
                        description={
                            commissionsQuery.error instanceof Error
                                ? commissionsQuery.error.message
                                : "Something went wrong while loading commissions."
                        }
                        buttonText="Retry"
                        onAction={() => commissionsQuery.refetch()}
                    />
                ) : hasActiveFilters ? (
                    <ReusableEmpty
                        media={<WalletIcon className="size-12"/>}
                        title="No matching results"
                        description="Try adjusting your search or filters."
                        buttonText="Clear filters"
                        onAction={handleClearFilters}
                    />
                ) : (
                    <ReusableEmpty
                        media={<WalletIcon className="size-12"/>}
                        title="No commissioned contracts yet"
                        description="Contracts with a sales agent attached will show up here."
                    />
                )
            }
        >
            <TableActionBar
                table={table}
                onExport={() => exportSelected("commissions")}
            />
            <Card className="w-full gap-3 py-0 mt-4">
                <CardHeader className="flex items-center justify-between px-3.5 py-2">
                    <div className="flex items-center gap-2.5">
                        <InputGroup className="w-64">
                            <InputGroupAddon align="inline-start">
                                <SearchIcon/>
                            </InputGroupAddon>
                            <InputGroupInput
                                placeholder="Search contract, client, plot, agent..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            {searchQuery.length > 0 && (
                                <InputGroupAddon align="inline-end">
                                    <InputGroupButton
                                        aria-label="Clear"
                                        title="Clear"
                                        size="icon-xs"
                                        onClick={() => setSearchQuery("")}
                                    >
                                        <XIcon/>
                                    </InputGroupButton>
                                </InputGroupAddon>
                            )}
                        </InputGroup>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline">
                                    <FunnelIcon/>
                                    Sales Agent
                                    {selectedAgentIds.length > 0 && (
                                        <Badge size="sm" variant="info-outline">
                                            {selectedAgentIds.length}
                                        </Badge>
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-56" align="start">
                                <div className="space-y-3">
                                    <div className="text-muted-foreground text-xs font-medium">
                                        Filter by Sales Agent
                                    </div>
                                    {agentOptions.length === 0 ? (
                                        <p className="text-muted-foreground text-sm">
                                            No sales agents on any commissioned contract yet.
                                        </p>
                                    ) : (
                                        <div className="space-y-3">
                                            {agentOptions.map((agent) => (
                                                <div key={agent.id} className="flex items-center gap-2.5">
                                                    <Checkbox
                                                        id={`agent-${agent.id}`}
                                                        checked={selectedAgentIds.includes(agent.id)}
                                                        onCheckedChange={(checked) =>
                                                            handleAgentChange(checked === true, agent.id)
                                                        }
                                                    />
                                                    <Label
                                                        htmlFor={`agent-${agent.id}`}
                                                        className="flex grow items-center justify-between gap-1.5 font-normal"
                                                    >
                                                        {agent.name}
                                                        <span className="text-muted-foreground">
                                                            {agent.count}
                                                        </span>
                                                    </Label>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </PopoverContent>
                        </Popover>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline">
                                    <FunnelIcon/>
                                    Commission Status
                                    {selectedCommissionStatuses.length > 0 && (
                                        <Badge size="sm" variant="info-outline">
                                            {selectedCommissionStatuses.length}
                                        </Badge>
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-56" align="start">
                                <div className="space-y-3">
                                    <div className="text-muted-foreground text-xs font-medium">
                                        Filter by Commission Status
                                    </div>
                                    <div className="space-y-3">
                                        {COMMISSION_STATUS_ORDER.map((status) => (
                                            <div key={status} className="flex items-center gap-2.5">
                                                <Checkbox
                                                    id={`commission-status-${status}`}
                                                    checked={selectedCommissionStatuses.includes(status)}
                                                    onCheckedChange={(checked) =>
                                                        handleCommissionStatusChange(checked === true, status)
                                                    }
                                                />
                                                <Label
                                                    htmlFor={`commission-status-${status}`}
                                                    className="flex grow items-center justify-between gap-1.5 font-normal"
                                                >
                                                    {COMMISSION_STATUS_LABELS[status]}
                                                    <span className="text-muted-foreground">
                                                        {commissionStatusCounts.get(status) ?? 0}
                                                    </span>
                                                </Label>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>
                    <CardAction/>
                </CardHeader>
                <CardContent className="p-0.5">
                    <Card className="p-0">
                        <DataGridContainer>
                            <DataGridScrollArea>
                                <DataGridTable footerContent={footer}/>
                            </DataGridScrollArea>
                        </DataGridContainer>
                    </Card>
                </CardContent>
                <CardFooter className="border-none bg-transparent! px-3.5 py-2">
                    <DataGridPagination
                        rowsPerPageLabel="Contracts per Page"
                        sizes={[8, 16, 32, 50, 100, 500]}
                    />
                </CardFooter>
            </Card>
        </DataGrid>
    )
}
