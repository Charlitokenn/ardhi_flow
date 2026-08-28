"use client"

// See the identical note in commission-payments-datagrid.tsx / payments-subtable.tsx:
// each DataGridColumnHeader reads sort state through builder calls React
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
import {type ColumnDef, type PaginationState, type SortingState, useTable,} from "@tanstack/react-table"
import {Card} from "@/components/ui/card.tsx"
import {formatDate, thousandSeparator} from "@/lib/utils"
import type {ClientProjectExpensePayment} from "@/types/projects.ts"
import {withProjectPaymentRunningTotals} from "@/lib/project-balance.ts"

function formatTzs(value: string | number): string {
    const numeric = Number(value)
    if (Number.isNaN(numeric)) return "—"
    return `Tshs. ${thousandSeparator(numeric)}`
}

/** Layout for the footer's totals row — see the identically named helper in
 * commission-payments-datagrid.tsx / payments-subtable.tsx. */
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

interface ProjectPaymentsDataGridProps {
    payments: ClientProjectExpensePayment[]
    /** The project's total acquisition target — see
     * lib/project-balance.ts's computeProjectAcquisitionTarget. */
    target: number
}

export function ProjectPaymentsDataGrid({payments, target}: ProjectPaymentsDataGridProps) {
    const [sorting, setSorting] = useState<SortingState>([{id: "paidAt", desc: false}])
    const [pagination, setPagination] = useState<PaginationState>({pageIndex: 0, pageSize: 8})

    // Running balance only makes sense computed over the payments in
    // chronological order — sorted once here, independent of whatever sort
    // the grid's own column header state currently shows.
    const rows = useMemo(() => {
        const chronological = [...payments].sort(
            (a, b) => new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime()
        )
        return withProjectPaymentRunningTotals(target, chronological)
    }, [payments, target])

    const columns = useMemo<ColumnDef<DataGridFeatures, ClientProjectExpensePayment>[]>(
        () => [
            {
                accessorKey: "paidAt",
                id: "paidAt",
                header: ({column}) => <DataGridColumnHeader title="Payment Date" visibility column={column}/>,
                cell: (info) => formatDate(info.getValue() as string),
                enableSorting: true,
                size: 150,
            },
            {
                id: "supplierName",
                accessorFn: (row) => row.payee?.fullName ?? "",
                header: ({column}) => <DataGridColumnHeader title="Supplier Name" visibility column={column}/>,
                cell: (info) => (info.row.original.payee?.fullName ?? "—"),
                enableSorting: true,
                size: 220,
            },
            {
                accessorKey: "amount",
                id: "amount",
                header: ({column}) => <DataGridColumnHeader title="Amount Paid" visibility column={column}/>,
                cell: (info) => formatTzs(info.getValue() as string),
                enableSorting: true,
                size: 170,
            },
            {
                id: "runningTotal",
                accessorFn: (row) => row.runningTotal ?? 0,
                header: ({column}) => <DataGridColumnHeader title="Running Balance" visibility column={column}/>,
                cell: (info) => formatTzs(info.row.original.runningTotal ?? 0),
                enableSorting: false,
                size: 170,
            },
        ],
        []
    )

    const table = useTable({
        features: dataGridFeatures,
        data: rows,
        columns,
        pageCount: Math.max(1, Math.ceil(rows.length / pagination.pageSize)),
        state: {sorting, pagination},
        onSortingChange: setSorting,
        onPaginationChange: setPagination,
        getRowId: (row: ClientProjectExpensePayment) => row.id,
    })

    const outstanding = rows.length > 0 ? (rows[rows.length - 1].runningTotal ?? target) : target

    const runningTotalSpan = footerColumnSpan(
        table.getVisibleLeafColumns().map((column) => column.id),
        "runningTotal"
    )

    const footer = runningTotalSpan && (
        <DataGridTableFootRow>
            {runningTotalSpan.leading > 0 && (
                <DataGridTableFootRowCell colSpan={runningTotalSpan.leading}>
                    <span className="text-muted-foreground">Outstanding Amount</span>
                </DataGridTableFootRowCell>
            )}
            <DataGridTableFootRowCell className="font-bold tabular-nums">
                {formatTzs(outstanding)}
            </DataGridTableFootRowCell>
            {runningTotalSpan.trailing > 0 && <DataGridTableFootRowCell colSpan={runningTotalSpan.trailing}/>}
        </DataGridTableFootRow>
    )

    return (
        <DataGrid
            table={table}
            recordCount={rows.length}
            tableLayout={{columnsVisibility: true, columnsPinnable: true}}
            emptyMessage="No payments have been logged against this project yet."
        >
            <div className="w-full space-y-2.5">
                <Card className="p-0">
                    <DataGridContainer>
                        <DataGridScrollArea>
                            <DataGridTable footerContent={footer}/>
                        </DataGridScrollArea>
                    </DataGridContainer>
                </Card>
                <DataGridPagination/>
            </div>
        </DataGrid>
    )
}
