"use client"

// Shared by SupplierProjectsDataGrid and VendorJobsDataGrid — both expand
// into the exact same two-column payment ledger (date + amount, with a
// total-paid footer), backed by `expenses` rows rather than a project- or
// job-specific payment type. Kept in its own file (rather than duplicated
// per grid, the usual pattern in this folder — see the identical sub-table
// note in commission-payments-datagrid.tsx) since the shape and the
// underlying `ClientContactExpensePayment` type are identical in both
// places.
// See the identical note in commission-payments-datagrid.tsx: the expand
// toggle and each DataGridColumnHeader read table state through builder
// calls React Compiler can't trace, so this file opts out entirely.
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
import type {ClientContactExpensePayment} from "@/types/contacts.ts"

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatTzs(value: string | number): string {
    const numeric = Number(value)
    if (Number.isNaN(numeric)) return "—"
    return `Tshs. ${thousandSeparator(numeric)}`
}

/** Layout for a totals footer row: how many visible columns sit before the
 * target column (the label spans those) and how many sit after (rendered
 * as one empty trailing cell) — derived from the table's actual visible
 * columns so the footer stays aligned under its target even if a column
 * between it and the table edge gets hidden. Mirrors the identically named
 * helper in commission-payments-datagrid.tsx. Returns null if the target
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
// Sub-table: dated payment ledger for one acquisition or one vendor job
// ---------------------------------------------------------------------------

export function PaymentsSubTable({
                                     payments,
                                     emptyMessage = "No payments have been logged yet.",
                                 }: {
    payments: ClientContactExpensePayment[]
    emptyMessage?: string
}) {
    const [sorting, setSorting] = useState<SortingState>([
        {id: "paidAt", desc: false},
    ])
    const [pagination, setPagination] = useState<PaginationState>({
        pageIndex: 0,
        pageSize: 5,
    })

    const columns = useMemo<ColumnDef<DataGridFeatures, ClientContactExpensePayment>[]>(
        () => [
            {
                accessorKey: "paidAt",
                id: "paidAt",
                header: ({column}) => (
                    <DataGridColumnHeader title="Payment Date" column={column}/>
                ),
                cell: (info) => formatDate(info.getValue() as string),
                enableSorting: true,
                size: 160,
            },
            {
                accessorKey: "amount",
                id: "amount",
                header: ({column}) => (
                    <DataGridColumnHeader title="Amount Paid" column={column}/>
                ),
                cell: (info) => formatTzs(info.getValue() as string),
                enableSorting: true,
                size: 160,
            },
        ],
        []
    )

    const table = useTable({
        features: dataGridFeatures,
        data: payments,
        columns,
        pageCount: Math.max(1, Math.ceil(payments.length / pagination.pageSize)),
        state: {
            sorting,
            pagination,
        },
        onSortingChange: setSorting,
        onPaginationChange: setPagination,
        getRowId: (row: ClientContactExpensePayment) => row.id,
    })

    const totalPaid = useMemo(
        () => payments.reduce((sum, payment) => sum + Number(payment.amount), 0),
        [payments]
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
                {formatTzs(totalPaid)}
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
                recordCount={payments.length}
                tableLayout={{
                    rowBorder: true,
                }}
                emptyMessage={emptyMessage}
            >
                <div className="w-full min-w-0 space-y-2.5 p-3 pl-12">
                    <Card className="p-0">
                        <DataGridContainer className="min-w-0">
                            <DataGridScrollArea className="min-w-0">
                                <DataGridTable footerContent={footer}/>
                            </DataGridScrollArea>
                        </DataGridContainer>
                    </Card>
                    <DataGridPagination className="pb-1.5" sizes={[8, 16, 32, 50, 100, 500]}/>
                </div>
            </DataGrid>
        </div>
    )
}
