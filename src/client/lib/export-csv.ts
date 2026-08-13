function escapeCSV(value: unknown): string {
    const str = String(value ?? "")
    // Escape quotes and wrap in quotes if contains comma, quote, or newline
    if (/[",\n\r]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`
    }
    return str
}

export interface ExportColumn<TData> {
    header: string
    accessor: (row: TData) => unknown
}

export function exportToCSV<TData>(
    rows: TData[],
    columns: ExportColumn<TData>[],
    filename?: string
): void {
    if (rows.length === 0 || columns.length === 0) return

    try {
        const headers = columns.map((c) => escapeCSV(c.header)).join(",")
        const csvRows = rows.map((row) =>
            columns.map((c) => escapeCSV(c.accessor(row))).join(",")
        )
        const csv = [headers, ...csvRows].join("\r\n")

        // BOM for Excel UTF-8 support
        const BOM = "\uFEFF"
        const blob = new Blob([BOM + csv], {
            type: "text/csv;charset=utf-8;",
        })

        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        const date = new Date().toISOString().slice(0, 10)
        link.href = url
        link.download = filename
            ? `${filename}-${date}.csv`
            : `export-${date}.csv`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
    } catch (error) {
        console.error("CSV export failed:", error)
        throw error
    }
}