"use client"

// This file keeps "use no memo" for the same reason as
// `datagrid+subtable.tsx`, the pattern it's built from: the expand button
// and each `DataGridColumnHeader` read sort/expand/visibility state through
// builder calls on a stable `row`/`column` reference, which React Compiler
// cannot see through. `DataGridColumnHeader` itself opts back in via
// `Subscribe`; this component's own reads (e.g. `row.getIsExpanded()`) do
// not, so the file opts out entirely.
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
import {DataGridColumnVisibility} from "@/components/reui/data-grid/data-grid-column-visibility.tsx"
import {DataGridPagination} from "@/components/reui/data-grid/data-grid-pagination.tsx"
import {DataGridScrollArea} from "@/components/reui/data-grid/data-grid-scroll-area.tsx"
import {DataGridTable} from "@/components/reui/data-grid/data-grid-table.tsx"
import {
    type ColumnDef,
    type ColumnVisibilityState,
    type ExpandedState,
    type PaginationState,
    type SortingState,
    useTable,
} from "@tanstack/react-table"

import {Button} from "@/components/ui/button.tsx"
import {Card, CardAction, CardHeader, CardTitle} from "@/components/ui/card.tsx"
import {formatDate, thousandSeparator} from "@/lib/utils"
import type {ClientContactInstallment, ClientContactPlot} from "@/types/contacts.ts"
import {ChevronDownIcon, ChevronUpIcon, Columns3Icon} from "lucide-react"

// ---------------------------------------------------------------------------
// Row shape + mapping
// ---------------------------------------------------------------------------

/**
 * Flattened view of a `ClientContactPlot` for the grid. `salesAgentFullName`
 * and `installments` both come off the plot's `latestContract` — a plot with
 * no contract yet (e.g. reserved but not sold) simply renders "—" and an
 * empty, non-expandable installment schedule.
 */
interface PlotHeldRow {
    id: string
    plotNumber: string
    surveyedPlotNumber: string | null
    projectName: string
    unsurveyedSize: string
    surveyedSize: string | null
    salesAgentFullName: string | null
    installments: ClientContactInstallment[]
}

function toPlotHeldRow(plot: ClientContactPlot): PlotHeldRow {
    return {
        id: plot.id,
        plotNumber: plot.plotNumber,
        surveyedPlotNumber: plot.surveyedPlotNumber,
        projectName: plot.project.projectName,
        unsurveyedSize: plot.unsurveyedSize,
        surveyedSize: plot.surveyedSize,
        salesAgentFullName: plot.latestContract?.salesAgent?.fullName ?? null,
        installments: plot.latestContract?.installments ?? [],
    }
}

function isNonBlank(value: string | null | undefined): value is string {
    return typeof value === "string" && value.trim().length > 0
}

/**
 * Picks which of each "surveyed vs. unsurveyed" column pair is visible by
 * default: once ANY plot in the list has a surveyed value, the surveyed
 * column leads and its unsurveyed counterpart hides, and vice versa. Both
 * columns stay registered (`enableHiding: true`) either way, so the hidden
 * one is always one click away via the "Columns" control — this only picks
 * the starting state, never removes the choice.
 */
function computeDefaultColumnVisibility(
    rows: PlotHeldRow[]
): ColumnVisibilityState {
    const hasSurveyedPlotNumber = rows.some((row) =>
        isNonBlank(row.surveyedPlotNumber)
    )
    const hasSurveyedSize = rows.some((row) => isNonBlank(row.surveyedSize))

    return {
        plotNumber: !hasSurveyedPlotNumber,
        surveyedPlotNumber: hasSurveyedPlotNumber,
        unsurveyedSize: !hasSurveyedSize,
        surveyedSize: hasSurveyedSize,
    }
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatSize(value: string | null): string {
    if (!isNonBlank(value)) return "—"
    const numeric = Number(value)
    if (Number.isNaN(numeric)) return "—"
    return `${thousandSeparator(numeric)} m\u00B2`
}

function formatTzs(value: string): string {
    const numeric = Number(value)
    if (Number.isNaN(numeric)) return "—"
    return `Tshs. ${thousandSeparator(numeric)}`
}

/** installment_no = 0 is reserved for an optional downpayment row (see the
 * `contract_installments` schema) — surfaced as "Downpayment" rather than a
 * confusing "Installment 0". */
function formatInstallmentLabel(installmentNo: number): string {
    return installmentNo === 0 ? "Downpayment" : `Installment ${installmentNo}`
}

function installmentStatusBadge(installment: ClientContactInstallment) {
    const isOverdue =
        installment.status !== "PAID" &&
        !Number.isNaN(new Date(installment.dueDate).getTime()) &&
        new Date(installment.dueDate).getTime() < Date.now()

    switch (installment.status) {
        case "PAID":
            return <Badge variant="success-light">Paid</Badge>
        case "PARTIAL":
            return (
                <Badge variant={isOverdue ? "destructive-light" : "warning-light"}>
                    {isOverdue ? "Partial · Overdue" : "Partial"}
                </Badge>
            )
        case "DUE":
        default:
            return (
                <Badge variant={isOverdue ? "destructive-light" : "info-light"}>
                    {isOverdue ? "Overdue" : "Due"}
                </Badge>
            )
    }
}

// ---------------------------------------------------------------------------
// Sub-table: installment schedule for one plot's latest contract
// ---------------------------------------------------------------------------

function InstallmentsSubTable({
                                   installments,
                               }: {
    installments: ClientContactInstallment[]
}) {
    const [sorting, setSorting] = useState<SortingState>([
        {id: "installmentNo", desc: false},
    ])
    const [pagination, setPagination] = useState<PaginationState>({
        pageIndex: 0,
        pageSize: 5,
    })

    const columns = useMemo<ColumnDef<DataGridFeatures, ClientContactInstallment>[]>(
        () => [
            {
                accessorKey: "originalDueDate",
                id: "originalDueDate",
                header: ({column}) => (
                    <DataGridColumnHeader title="Due Date" column={column}/>
                ),
                cell: (info) => formatDate(info.getValue() as string),
                enableSorting: true,
                size: 130,
            },
            {
                accessorKey: "installmentNo",
                id: "installmentNo",
                header: ({column}) => (
                    <DataGridColumnHeader title="Installment" column={column}/>
                ),
                cell: (info) => formatInstallmentLabel(info.getValue() as number),
                enableSorting: true,
                size: 150,
            },
            {
                accessorKey: "amountDue",
                id: "amountDue",
                header: ({column}) => (
                    <DataGridColumnHeader title="Amount Due" column={column}/>
                ),
                cell: (info) => formatTzs(info.getValue() as string),
                enableSorting: true,
                size: 150,
            },
            {
                accessorKey: "amountPaid",
                id: "amountPaid",
                header: ({column}) => (
                    <DataGridColumnHeader title="Amount Paid" column={column}/>
                ),
                cell: (info) => formatTzs(info.getValue() as string),
                enableSorting: true,
                size: 150,
            },
            {
                accessorKey: "penaltyAmount",
                id: "penaltyAmount",
                header: ({column}) => (
                    <DataGridColumnHeader title="Penalty" column={column}/>
                ),
                cell: (info) => formatTzs(info.getValue() as string),
                enableSorting: true,
                size: 130,
            },
            {
                accessorKey: "status",
                id: "status",
                header: ({column}) => (
                    <DataGridColumnHeader title="Status" column={column}/>
                ),
                cell: ({row}) => installmentStatusBadge(row.original),
                enableSorting: true,
                size: 140,
            },
        ],
        []
    )

    const table = useTable({
        features: dataGridFeatures,
        data: installments,
        columns,
        pageCount: Math.max(1, Math.ceil(installments.length / pagination.pageSize)),
        state: {
            sorting,
            pagination,
        },
        onSortingChange: setSorting,
        onPaginationChange: setPagination,
        getRowId: (row: ClientContactInstallment) => row.id,
    })

    return (
        <div className="bg-background min-w-0">
            <DataGrid
                table={table}
                recordCount={installments.length}
                tableLayout={{
                    rowBorder: true,
                }}
                emptyMessage="No installments have been scheduled for this contract yet."
            >
                <div className="w-full min-w-0 space-y-2.5 p-3 pl-12">
                    <Card className="p-0">
                        <DataGridContainer className="min-w-0">
                            <DataGridScrollArea className="min-w-0">
                                <DataGridTable/>
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
// Main grid: plots held by this client
// ---------------------------------------------------------------------------

export function PlotsHeldDataGrid({plots}: { plots: ClientContactPlot[] }) {
    const rows = useMemo<PlotHeldRow[]>(() => plots.map(toPlotHeldRow), [plots])

    const [pagination, setPagination] = useState<PaginationState>({
        pageIndex: 0,
        pageSize: 8,
    })
    const [sorting, setSorting] = useState<SortingState>([])
    const [expandedRows, setExpandedRows] = useState<ExpandedState>({})
    const [columnOrder, setColumnOrder] = useState<string[]>([
        "expand",
        "plotNumber",
        "surveyedPlotNumber",
        "projectName",
        "unsurveyedSize",
        "surveyedSize",
        "salesAgent",
    ])
    // Lazy-initialized once from the first data this instance sees. The tab
    // this grid lives in only mounts for a given contact (see
    // `ViewContactForm`'s `hasPlots` gate), so a fresh default per contact
    // falls out of the component naturally remounting on navigation.
    const [columnVisibility, setColumnVisibility] =
        useState<ColumnVisibilityState>(() => computeDefaultColumnVisibility(rows))

    const columns = useMemo<ColumnDef<DataGridFeatures, PlotHeldRow>[]>(
        () => [
            {
                id: "expand",
                header: () => null,
                cell: ({row}) => {
                    return row.getCanExpand() ? (
                        <Button
                            onClick={row.getToggleExpandedHandler()}
                            size="icon-sm"
                            variant="ghost"
                            className="opacity-70 hover:bg-transparent hover:opacity-100"
                            aria-label={
                                row.getIsExpanded()
                                    ? "Collapse installment schedule"
                                    : "Expand installment schedule"
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
                size: 25,
                enableResizing: false,
                meta: {
                    expandedContent: (row) => (
                        <InstallmentsSubTable installments={row.installments}/>
                    ),
                },
            },
            {
                accessorKey: "plotNumber",
                id: "plotNumber",
                header: ({column}) => (
                    <DataGridColumnHeader
                        title="Plot Number"
                        visibility={true}
                        column={column}
                    />
                ),
                cell: (info) => info.getValue() as string,
                enableSorting: true,
                enableHiding: true,
                size: 140,
            },
            {
                accessorKey: "surveyedPlotNumber",
                id: "surveyedPlotNumber",
                header: ({column}) => (
                    <DataGridColumnHeader
                        title="Surveyed Plot No."
                        visibility={true}
                        column={column}
                    />
                ),
                cell: (info) => (info.getValue() as string | null) ?? "—",
                enableSorting: true,
                enableHiding: true,
                size: 170,
            },
            {
                accessorKey: "projectName",
                id: "projectName",
                header: ({column}) => (
                    <DataGridColumnHeader
                        title="Project"
                        visibility={true}
                        column={column}
                    />
                ),
                cell: (info) => info.getValue() as string,
                enableSorting: true,
                enableHiding: true,
                size: 200,
            },
            {
                accessorKey: "unsurveyedSize",
                id: "unsurveyedSize",
                header: ({column}) => (
                    <DataGridColumnHeader
                        title="Unsurveyed Size"
                        visibility={true}
                        column={column}
                    />
                ),
                cell: (info) => formatSize(info.getValue() as string),
                enableSorting: true,
                enableHiding: true,
                size: 160,
            },
            {
                accessorKey: "surveyedSize",
                id: "surveyedSize",
                header: ({column}) => (
                    <DataGridColumnHeader
                        title="Surveyed Size"
                        visibility={true}
                        column={column}
                    />
                ),
                cell: (info) => formatSize(info.getValue() as string | null),
                enableSorting: true,
                enableHiding: true,
                size: 160,
            },
            {
                accessorKey: "salesAgentFullName",
                id: "salesAgent",
                header: ({column}) => (
                    <DataGridColumnHeader
                        title="Sales Agent"
                        visibility={true}
                        column={column}
                    />
                ),
                cell: (info) => (info.getValue() as string | null) ?? "—",
                enableSorting: true,
                enableHiding: true,
                size: 180,
            },
        ],
        []
    )

    const table = useTable({
        features: dataGridFeatures,
        columns,
        data: rows,
        pageCount: Math.max(1, Math.ceil(rows.length / pagination.pageSize)),
        getRowId: (row: PlotHeldRow) => row.id,
        getRowCanExpand: (row) => row.original.installments.length > 0,
        state: {
            pagination,
            sorting,
            expanded: expandedRows,
            columnOrder,
            columnVisibility,
        },
        onPaginationChange: setPagination,
        onSortingChange: setSorting,
        onExpandedChange: setExpandedRows,
        onColumnOrderChange: setColumnOrder,
        onColumnVisibilityChange: setColumnVisibility,
    })

    if (rows.length === 0) {
        return (
            <p className="text-muted-foreground text-sm">
                No plots are recorded for this client yet.
            </p>
        )
    }

    return (
        <DataGrid
            table={table}
            recordCount={rows.length}
            tableLayout={{
                columnsPinnable: true,
                columnsMovable: true,
                columnsVisibility: true,
            }}
            emptyMessage="No plots are recorded for this client yet."
        >
            <div className="w-full space-y-2.5">
                <Card className="p-0">
                    <CardHeader className="flex-row items-center justify-between gap-2 border-b py-3">
                        <CardTitle className="text-muted-foreground text-sm font-medium">
                            {rows.length} {rows.length === 1 ? "plot" : "plots"} held
                        </CardTitle>
                        <CardAction>
                            <DataGridColumnVisibility
                                table={table}
                                trigger={
                                    <Button variant="outline" size="sm">
                                        <Columns3Icon className="size-3.5"/>
                                        Columns
                                    </Button>
                                }
                            />
                        </CardAction>
                    </CardHeader>
                    <DataGridContainer>
                        <DataGridScrollArea>
                            <DataGridTable/>
                        </DataGridScrollArea>
                    </DataGridContainer>
                </Card>
                <DataGridPagination/>
            </div>
        </DataGrid>
    )
}
