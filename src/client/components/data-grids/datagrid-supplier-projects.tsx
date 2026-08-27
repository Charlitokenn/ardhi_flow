"use client"

// See the identical note in plots-held-datagrid.tsx: the expand toggle and
// each DataGridColumnHeader read table state through builder calls React
// Compiler can't trace, so this file opts out entirely.
"use no memo"

import {useMemo, useState} from "react"
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
import type {ClientContactAsSellerAcquisition, ClientContactExpensePayment,} from "@/types/contacts.ts"
import {ChevronDownIcon, ChevronUpIcon} from "lucide-react"
import {PaymentsSubTable} from "@/components/data-grids/payments-subtable.tsx"

// ---------------------------------------------------------------------------
// Formatting + derivation helpers
// ---------------------------------------------------------------------------

function formatTzs(value: string | number): string {
    const numeric = Number(value)
    if (Number.isNaN(numeric)) return "—"
    return `Tshs. ${thousandSeparator(numeric)}`
}

/** All dated payments logged across every installment of a deal, flattened
 * into one list for the sub-table. A CASH deal has exactly one installment
 * (see the schema note on `projectAcquisitionInstallments`), so this is
 * usually just that installment's payments, but stays correct for an
 * INSTALLMENT-plan deal spanning several. */
function acquisitionPayments(
    acquisition: ClientContactAsSellerAcquisition
): ClientContactExpensePayment[] {
    return acquisition.installments.flatMap((installment) => installment.payments)
}

/** Mirrors `computeTotalPaid` in lib/contract-balance.ts — sum of the actual
 * dated payment records, not the installments' own `amountPaid` aggregate,
 * so this always reflects individually logged cash movements. */
function computeAcquisitionTotalPaid(acquisition: ClientContactAsSellerAcquisition): number {
    return acquisitionPayments(acquisition).reduce(
        (sum, payment) => sum + Number(payment.amount),
        0
    )
}

function computeAcquisitionBalance(acquisition: ClientContactAsSellerAcquisition): number {
    return Number(acquisition.totalPurchaseValue) - computeAcquisitionTotalPaid(acquisition)
}

/** Renders a totals footer row with one total per target column, anchored
 * under each column by id (so hiding/reordering columns never misaligns a
 * total) and a "Totals" label placed in `labelColumnId`. A multi-column
 * generalization of the single-target `footerColumnSpan` helper used in
 * commission-payments-datagrid.tsx — this grid needs three simultaneous
 * totals (Acquisition Value, Paid, Balance), not one. */
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
// Main grid: projects purchased from this land seller
// ---------------------------------------------------------------------------

export function DatagridSupplierProjects({
                                             acquisitions,
                                         }: {
    acquisitions: ClientContactAsSellerAcquisition[]
}) {
    const [pagination, setPagination] = useState<PaginationState>({
        pageIndex: 0,
        pageSize: 8,
    })
    const [sorting, setSorting] = useState<SortingState>([])
    const [expandedRows, setExpandedRows] = useState<ExpandedState>({})
    // The project identity is what makes any other column on this row
    // meaningful, so it — and the expand toggle right next to it — stay
    // pinned as the grid scrolls horizontally, same as the "contract" column
    // in commission-payments-datagrid.tsx.
    const [columnPinning, setColumnPinning] = useState<ColumnPinningState>({
        start: ["expand", "project"],
        end: [],
    })

    const columns = useMemo<ColumnDef<DataGridFeatures, ClientContactAsSellerAcquisition>[]>(
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
                            payments={acquisitionPayments(row)}
                            emptyMessage="No payments have been logged for this acquisition yet."
                        />
                    ),
                },
            },
            {
                id: "project",
                header: ({column}) => (
                    <DataGridColumnHeader
                        title="Project"
                        visibility={true}
                        column={column}
                    />
                ),
                cell: ({row}) => (
                    <div className="space-y-px">
                        <div className="text-foreground font-medium">
                            {row.original.project.projectName}
                        </div>
                        <div className="text-muted-foreground">
                            Acquired {formatDate(row.original.dealDate)}
                        </div>
                    </div>
                ),
                enableSorting: false,
                enableHiding: false,
                size: 240,
            },
            {
                accessorKey: "totalPurchaseValue",
                id: "acquisitionValue",
                header: ({column}) => (
                    <DataGridColumnHeader
                        title="Acquisition Value"
                        visibility={true}
                        column={column}
                    />
                ),
                cell: (info) => formatTzs(info.getValue() as string),
                enableSorting: true,
                enableHiding: true,
                size: 170,
            },
            {
                id: "totalPaid",
                accessorFn: (row) => computeAcquisitionTotalPaid(row),
                header: ({column}) => (
                    <DataGridColumnHeader
                        title="Total Paid"
                        visibility={true}
                        column={column}
                    />
                ),
                cell: (info) => formatTzs(info.getValue() as number),
                enableSorting: true,
                enableHiding: true,
                size: 160,
            },
            {
                id: "balance",
                accessorFn: (row) => computeAcquisitionBalance(row),
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
                size: 160,
            },
        ],
        []
    )

    const table = useTable({
        features: dataGridFeatures,
        columns,
        data: acquisitions,
        pageCount: Math.max(1, Math.ceil(acquisitions.length / pagination.pageSize)),
        getRowId: (row: ClientContactAsSellerAcquisition) => row.id,
        getRowCanExpand: (row) => acquisitionPayments(row.original).length > 0,
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

    if (acquisitions.length === 0) {
        return (
            <p className="text-muted-foreground text-sm">
                No projects have been purchased from this land seller yet.
            </p>
        )
    }

    const totalAcquisitionValue = acquisitions.reduce(
        (sum, acquisition) => sum + Number(acquisition.totalPurchaseValue),
        0
    )
    const totalPaid = acquisitions.reduce(
        (sum, acquisition) => sum + computeAcquisitionTotalPaid(acquisition),
        0
    )
    const totalBalance = totalAcquisitionValue - totalPaid

    const footer = renderTotalsFootRow(
        table.getVisibleLeafColumns().map((column) => column.id),
        {
            acquisitionValue: formatTzs(totalAcquisitionValue),
            totalPaid: formatTzs(totalPaid),
            balance: formatTzs(totalBalance),
        },
        "project"
    )

    return (
        <DataGrid
            table={table}
            recordCount={acquisitions.length}
            tableLayout={{
                columnsVisibility: true,
                columnsPinnable: true,
            }}
            emptyMessage="No projects have been purchased from this land seller yet."
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
