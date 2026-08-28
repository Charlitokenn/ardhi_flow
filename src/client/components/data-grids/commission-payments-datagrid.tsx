"use client"

// See the identical note in plots-held-datagrid.tsx: the expand toggle and
// each DataGridColumnHeader read table state through builder calls React
// Compiler can't trace, so this file opts out entirely.
"use no memo"

import {useMemo, useState} from "react"
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
} from "@/components/reui/data-grid/data-grid-table.tsx"
import {
    type ColumnDef,
    type ColumnPinningState,
    type ExpandedState,
    type PaginationState,
    type SortingState,
    useTable,
} from "@tanstack/react-table"

import {Avatar, AvatarFallback} from "@/components/ui/avatar.tsx"
import {Button} from "@/components/ui/button.tsx"
import {Card} from "@/components/ui/card.tsx"
import {thousandSeparator} from "@/lib/utils"
import type {ClientContactAsAgentContract, ClientContactCommissionPayout,} from "@/types/contacts.ts"
import {ChevronDownIcon, ChevronUpIcon} from "lucide-react"
import ReusableTooltip from "@/components-reusable/reusable-tooltip.tsx";

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

/** Mirrors the contract status badge used in contracts-datagrid.tsx, kept
 * local here since this grid only ever needs it for the handful of
 * contracts a given agent is attached to. */
function contractStatusBadge(status: ClientContactAsAgentContract["status"]) {
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
// Main grid: plot sale contracts this agent earns commission on
// ---------------------------------------------------------------------------

export function CommissionPaymentsDataGrid({
                                               contracts,
                                           }: {
    contracts: ClientContactAsAgentContract[]
}) {
    const [pagination, setPagination] = useState<PaginationState>({
        pageIndex: 0,
        pageSize: 8,
    })
    const [sorting, setSorting] = useState<SortingState>([])
    const [expandedRows, setExpandedRows] = useState<ExpandedState>({})
    // The contract identity (client/plot/project) is what makes any other
    // column on this row meaningful, so it — and the expand toggle right
    // next to it — stay pinned as the grid scrolls horizontally. Still a
    // controlled state (not just an initial value) so the header's own
    // Pin/Unpin control can move it, same as any other pinned column.
    const [columnPinning, setColumnPinning] = useState<ColumnPinningState>({
        start: ["expand", "contract"],
        end: [],
    })

    const columns = useMemo<ColumnDef<DataGridFeatures, ClientContactAsAgentContract>[]>(
        () => [
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
                    const plotNumber =
                        row.original.plot.surveyedPlotNumber ?? row.original.plot.plotNumber
                    return (
                        <div className="flex items-center gap-3">
                            <Avatar className="size-8">
                                <AvatarFallback>{initials(clientName)}</AvatarFallback>
                            </Avatar>
                            <div className="space-y-px">
                                <div className="text-foreground font-medium">{clientName}</div>
                                <div className="text-muted-foreground">
                                    Plot No. {plotNumber} · {row.original.plot.project.projectName}
                                </div>
                            </div>
                        </div>
                    )
                },
                enableSorting: false,
                enableHiding: false,
                size: 260,
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
            },
        ],
        []
    )

    const table = useTable({
        features: dataGridFeatures,
        columns,
        data: contracts,
        pageCount: Math.max(1, Math.ceil(contracts.length / pagination.pageSize)),
        getRowId: (row: ClientContactAsAgentContract) => row.id,
        getRowCanExpand: (row) => row.original.commissionPayouts.length > 0,
        state: {
            pagination,
            sorting,
            expanded: expandedRows,
            columnPinning,
        },
        onPaginationChange: setPagination,
        onSortingChange: setSorting,
        onExpandedChange: setExpandedRows,
        onColumnPinningChange: setColumnPinning,
    })

    if (contracts.length === 0) {
        return (
            <p className="text-muted-foreground text-sm">
                No commissioned contracts are recorded for this agent yet.
            </p>
        )
    }

    const totalCommission = contracts
        .filter((contract) => contract.status !== "CANCELLED")
        .reduce(
            (sum, contract) => sum + Number(contract.commissionAmount),
            0
        )

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
            recordCount={contracts.length}
            tableLayout={{
                columnsVisibility: true,
                columnsPinnable: true,
            }}
            emptyMessage="No commissioned contracts are recorded for this agent yet."
        >
            <div className="w-full space-y-2.5">
                <Card className="p-0">
                    <DataGridContainer>
                        <DataGridScrollArea>
                            <DataGridTable footerContent={footer}/>
                        </DataGridScrollArea>
                    </DataGridContainer>
                </Card>
                <DataGridPagination sizes={[8, 16, 32, 50, 100, 500]}/>
            </div>
        </DataGrid>
    )
}