import { type Table } from "@tanstack/react-table"
import {
    ActionBar,
    ActionBarClose,
    ActionBarGroup,
    ActionBarItem,
    ActionBarSelection,
    ActionBarSeparator,
} from "@/components/ui/action-bar"
import { DownloadIcon, Trash2Icon, XIcon } from "lucide-react"

interface TableActionBarProps<TData> {
    table: Table<TData>
    onExport?: () => void
    onDelete?: () => void
    exportLabel?: string
}

export function TableActionBar<TData>({
                                          table,
                                          onExport,
                                          onDelete,
                                          exportLabel = "Export CSV",
                                      }: TableActionBarProps<TData>) {
    const selectedCount = table.getSelectedRowModel().rows.length
    const hasSelection = selectedCount > 0

    return (
        <ActionBar
            open={hasSelection}
            onOpenChange={(open) => {
                if (!open) table.toggleAllRowsSelected(false)
            }}
            side="bottom"
            align="center"
            sideOffset={24}
        >
            <ActionBarSelection>
                {selectedCount} selected
                <ActionBarSeparator />
                <ActionBarClose>
                    <XIcon />
                </ActionBarClose>
            </ActionBarSelection>
            <ActionBarSeparator />

            <ActionBarGroup>
                {onExport && (
                    <ActionBarItem onSelect={onExport}>
                        <DownloadIcon className="mr-1.5 size-3.5" />
                        {exportLabel}
                    </ActionBarItem>
                )}

                {onDelete && (
                    <>
                        <ActionBarSeparator orientation="vertical" />
                        <ActionBarItem
                            onSelect={onDelete}
                            className="text-destructive hover:text-destructive"
                        >
                            <Trash2Icon className="mr-1.5 size-3.5" />
                            Delete
                        </ActionBarItem>
                    </>
                )}
            </ActionBarGroup>
        </ActionBar>
    )
}