import {type Row, type Table} from "@tanstack/react-table"
import {useCallback} from "react"
import {type ExportColumn, exportToCSV} from "../../../../apps/web/src/client/lib/export-csv"
import {type DataGridFeatures} from "../../../../apps/web/src/client/components/reui/data-grid/data-grid"

export function useTableCSVExport<TData extends object>(
    table: Table<DataGridFeatures, TData>,
    columns: ExportColumn<TData>[]
) {
    const exportSelected = useCallback(
        (filename?: string) => {
            const selectedRows = table.getSelectedRowModel().rows
            const data = selectedRows.map((row: Row<DataGridFeatures, TData>) => row.original)
            exportToCSV(data, columns, filename)
        },
        [table, columns]
    )

    const exportAll = useCallback(
        (filename?: string) => {
            const data = table.getRowModel().rows.map((row) => row.original)
            exportToCSV(data, columns, filename)
        },
        [table, columns]
    )

    const selectedCount = table.getSelectedRowModel().rows.length

    return {exportSelected, exportAll, selectedCount}
}