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

import {Button} from "@/components/ui/button.tsx"
import {Card} from "@/components/ui/card.tsx"
import {formatDate, thousandSeparator} from "@/lib/utils"
import type {ClientContactVendorJob} from "@/types/contacts.ts"
import {ChevronDownIcon, ChevronUpIcon} from "lucide-react"
import ReusableTooltip from "@/components-reusable/reusable-tooltip.tsx";
import {PaymentsSubTable} from "@/components/data-grids/payments-subtable.tsx"

// ---------------------------------------------------------------------------
// Formatting + derivation helpers
// ---------------------------------------------------------------------------

function formatTzs(value: string | number): string {
    const numeric = Number(value)
    if (Number.isNaN(numeric)) return "—"
    return `Tshs. ${thousandSeparator(numeric)}`
}

/** Mirrors `computeTotalPaid` in lib/contract-balance.ts — sum of the
 * actual dated payment records logged against the job, not a stored
 * aggregate field (vendor jobs, unlike contracts/installments, don't carry
 * one). */
function computeJobTotalPaid(job: ClientContactVendorJob): number {
    return job.payments.reduce((sum, payment) => sum + Number(payment.amount), 0)
}

function computeJobBalance(job: ClientContactVendorJob): number {
    return Number(job.agreedAmount) - computeJobTotalPaid(job)
}

/** Mirrors the contract/payout status badges in commission-payments-datagrid.tsx. */
function jobStatusBadge(status: ClientContactVendorJob["status"]) {
    switch (status) {
        case "COMPLETED":
            return (
                <ReusableTooltip
                    trigger={<Badge variant="success-outline">Completed</Badge>}
                    tooltip="This job has been finished and signed off."
                />
            )
        case "IN_PROGRESS":
            return (
                <ReusableTooltip
                    trigger={<Badge variant="info-outline">In Progress</Badge>}
                    tooltip="Work on this job is currently underway."
                />
            )
        case "CANCELLED":
            return (
                <ReusableTooltip
                    trigger={<Badge variant="secondary">Cancelled</Badge>}
                    tooltip="This job was cancelled before completion."
                />
            )
        case "ASSIGNED":
        default:
            return (
                <ReusableTooltip
                    trigger={<Badge variant="warning-outline">Assigned</Badge>}
                    tooltip="This job has been assigned but work has not started yet."
                />
            )
    }
}

/** Renders a totals footer row with one total per target column, anchored
 * under each column by id (so hiding/reordering columns never misaligns a
 * total) and a "Totals" label placed in `labelColumnId`. A multi-column
 * generalization of the single-target `footerColumnSpan` helper used in
 * commission-payments-datagrid.tsx — this grid needs three simultaneous
 * totals (Cost, Paid, Balance), not one. */
function renderTotalsFootRow(
    visibleColumnIds: string[],
    totals: Record<string, string>,
    labelColumnId: string,
    labelText = "Totals"
) {
    if (!visibleColumnIds.some((id) => id in totals)) return null
    return (
        <DataGridTableFootRow>
            {visibleColumnIds.map((id) =>
                id in totals ? (
                    <DataGridTableFootRowCell key={id} className="font-bold tabular-nums">
                        {totals[id]}
                    </DataGridTableFootRowCell>
                ) : id === labelColumnId ? (
                    <DataGridTableFootRowCell key={id}>
                        <span className="text-muted-foreground">{labelText}</span>
                    </DataGridTableFootRowCell>
                ) : (
                    <DataGridTableFootRowCell key={id}/>
                )
            )}
        </DataGridTableFootRow>
    )
}

// ---------------------------------------------------------------------------
// Main grid: jobs/assignments given to this vendor
// ---------------------------------------------------------------------------

export function DatagridVendorJobs({
                                       jobs,
                                   }: {
    jobs: ClientContactVendorJob[]
}) {
    const [pagination, setPagination] = useState<PaginationState>({
        pageIndex: 0,
        pageSize: 8,
    })
    const [sorting, setSorting] = useState<SortingState>([])
    const [expandedRows, setExpandedRows] = useState<ExpandedState>({})
    // The job identity is what makes any other column on this row
    // meaningful, so it — and the expand toggle right next to it — stay
    // pinned as the grid scrolls horizontally, same as the "contract" column
    // in commission-payments-datagrid.tsx.
    const [columnPinning, setColumnPinning] = useState<ColumnPinningState>({
        start: ["expand", "job"],
        end: [],
    })

    const columns = useMemo<ColumnDef<DataGridFeatures, ClientContactVendorJob>[]>(
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
                                row.getIsExpanded() ? "Collapse payments" : "Expand payments"
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
                        <PaymentsSubTable
                            payments={row.payments}
                            emptyMessage="No payments have been logged for this job yet."
                        />
                    ),
                },
            },
            {
                accessorKey: "startDate",
                id: "jobDate",
                header: ({column}) => (
                    <DataGridColumnHeader
                        title="Job Date"
                        visibility={true}
                        column={column}
                    />
                ),
                cell: (info) => {
                    const value = info.getValue() as string | null
                    return value ? formatDate(value) : "—"
                },
                enableSorting: true,
                enableHiding: true,
                size: 130,
            },
            {
                id: "job",
                accessorKey: "title",
                header: ({column}) => (
                    <DataGridColumnHeader
                        title="Job Name"
                        visibility={true}
                        column={column}
                    />
                ),
                cell: ({row}) => (
                    <div className="space-y-px">
                        <div className="text-foreground font-medium">{row.original.title}</div>
                        <div>{jobStatusBadge(row.original.status)}</div>
                    </div>
                ),
                enableSorting: true,
                enableHiding: false,
                size: 220,
            },
            {
                accessorKey: "description",
                id: "description",
                header: ({column}) => (
                    <DataGridColumnHeader
                        title="Job Description"
                        visibility={true}
                        column={column}
                    />
                ),
                cell: (info) => (
                    <span className="text-muted-foreground line-clamp-2">
                        {(info.getValue() as string | null) ?? "—"}
                    </span>
                ),
                enableSorting: false,
                enableHiding: true,
                size: 260,
            },
            {
                accessorKey: "agreedAmount",
                id: "cost",
                header: ({column}) => (
                    <DataGridColumnHeader
                        title="Cost"
                        visibility={true}
                        column={column}
                    />
                ),
                cell: (info) => formatTzs(info.getValue() as string),
                enableSorting: true,
                enableHiding: true,
                size: 150,
            },
            {
                id: "paidAmount",
                accessorFn: (row) => computeJobTotalPaid(row),
                header: ({column}) => (
                    <DataGridColumnHeader
                        title="Paid Amount"
                        visibility={true}
                        column={column}
                    />
                ),
                cell: (info) => formatTzs(info.getValue() as number),
                enableSorting: true,
                enableHiding: true,
                size: 150,
            },
            {
                id: "balance",
                accessorFn: (row) => computeJobBalance(row),
                header: ({column}) => (
                    <DataGridColumnHeader
                        title="Balance"
                        visibility={true}
                        column={column}
                    />
                ),
                cell: (info) => formatTzs(info.getValue() as number),
                enableSorting: true,
                enableHiding: true,
                size: 150,
            },
        ],
        []
    )

    const table = useTable({
        features: dataGridFeatures,
        columns,
        data: jobs,
        pageCount: Math.max(1, Math.ceil(jobs.length / pagination.pageSize)),
        getRowId: (row: ClientContactVendorJob) => row.id,
        getRowCanExpand: (row) => row.original.payments.length > 0,
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

    if (jobs.length === 0) {
        return (
            <p className="text-muted-foreground text-sm">
                No jobs have been assigned to this vendor yet.
            </p>
        )
    }

    const totalCost = jobs.reduce((sum, job) => sum + Number(job.agreedAmount), 0)
    const totalPaid = jobs.reduce((sum, job) => sum + computeJobTotalPaid(job), 0)
    const totalBalance = totalCost - totalPaid

    const footer = renderTotalsFootRow(
        table.getVisibleLeafColumns().map((column) => column.id),
        {
            cost: formatTzs(totalCost),
            paidAmount: formatTzs(totalPaid),
            balance: formatTzs(totalBalance),
        },
        "job"
    )

    return (
        <DataGrid
            table={table}
            recordCount={jobs.length}
            tableLayout={{
                columnsVisibility: true,
                columnsPinnable: true,
            }}
            emptyMessage="No jobs have been assigned to this vendor yet."
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
