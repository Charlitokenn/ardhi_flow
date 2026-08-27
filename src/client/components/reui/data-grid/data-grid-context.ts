import type {ReactNode} from "react"
import {createContext, useContext} from "react"
import type {Column, RowData} from "@tanstack/react-table"
import type {DataGridFeatures} from "./data-grid"

export interface DataGridContextProps<TData extends object> {
    props: {
        className?: string
        recordCount: number
        onRowClick?: (row: TData) => void
        getRowClassName?: (row: TData) => string | undefined
        isLoading?: boolean
        loadingMode?: "skeleton" | "spinner"
        loadingMessage?: ReactNode | string
        fetchingMoreMessage?: ReactNode | string
        allRowsLoadedMessage?: ReactNode | string
        emptyMessage?: ReactNode | string
        tableLayout?: {
            dense?: boolean
            cellBorder?: boolean
            rowBorder?: boolean
            rowRounded?: boolean
            stripped?: boolean
            headerBackground?: boolean
            footerBackground?: boolean
            headerBorder?: boolean
            headerSticky?: boolean
            width?: "auto" | "fixed"
            columnsVisibility?: boolean
            columnsResizable?: boolean
            columnsResizeMode?: "onChange" | "onEnd"
            columnsPinnable?: boolean
            columnsMovable?: boolean
            columnsDraggable?: boolean
            rowsDraggable?: boolean
            rowsPinnable?: boolean
        }
        tableClassNames?: {
            base?: string
            header?: string
            headerRow?: string
            headerSticky?: string
            body?: string
            bodyRow?: string
            footer?: string
            edgeCell?: string
        }
    }
    table: import("./data-grid").DataGridTableInstance<TData>
    recordCount: number
    isLoading: boolean
    autoSize?: import("./data-grid").DataGridAutoSizeController
}

export const DataGridContext = createContext<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    DataGridContextProps<any> | undefined
>(undefined)

/**
 * Reads the grid context. Pass `TData` from the calling component when the
 * table, a row or a cell is handed on to something typed against that row
 * shape: v9 declares `TData` invariant, so the default `any` no longer
 * unifies with a concrete row type the way it did on v8.
 */
export function useDataGrid<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    TData extends object = any,
>(): DataGridContextProps<TData> {
    const context = useContext(DataGridContext) as
        | DataGridContextProps<TData>
        | undefined
    if (!context) {
        throw new Error("useDataGrid must be used within a DataGridProvider")
    }
    return context
}

/** Label for headers / column visibility: `meta.headerTitle`, string `columnDef.header`, or `column.id`. */
export function getColumnHeaderLabel<TData extends RowData, TValue>(
    column: Column<DataGridFeatures, TData, TValue>
): string {
    const meta = column.columnDef.meta as { headerTitle?: string } | undefined
    if (typeof meta?.headerTitle === "string") return meta.headerTitle
    const defHeader = column.columnDef.header
    if (typeof defHeader === "string") return defHeader
    return String(column.id)
}
