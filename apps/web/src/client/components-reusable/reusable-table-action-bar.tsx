import {type Table} from "@tanstack/react-table"
import {type DataGridFeatures} from "@/components/reui/data-grid/data-grid"
import {
    ActionBar,
    ActionBarClose,
    ActionBarGroup,
    ActionBarItem,
    ActionBarSelection,
    ActionBarSeparator,
} from "@/components/ui/action-bar"
import {DownloadIcon, Trash2Icon, XIcon} from "lucide-react"

interface TableActionBarProps<TData extends object> {
    table: Table<DataGridFeatures, TData>
    onExport?: () => void
    onDelete?: () => void
    exportLabel?: string
    /** Portal target for the bar itself. ActionBar renders via a raw
     *  ReactDOM.createPortal to document.body by default — fine at the top
     *  level, but when this table lives inside another modal Dialog/Sheet,
     *  that Sheet makes everything outside its own content non-interactive
     *  while open, and a body-level portal isn't recognized as part of it.
     *  Pass a ref to a node inside that ancestor Sheet's own content here to
     *  keep the bar clickable. Omit for the default (document.body). */
    portalContainer?: Element | DocumentFragment | null
}

export function TableActionBar<TData extends object>({
                                                         table,
                                                         onExport,
                                                         onDelete,
                                                         exportLabel = "Export CSV",
                                                         portalContainer,
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
            portalContainer={portalContainer}
        >
            <ActionBarSelection>
                {selectedCount} selected
                <ActionBarSeparator/>
                <ActionBarClose>
                    <XIcon/>
                </ActionBarClose>
            </ActionBarSelection>
            <ActionBarSeparator/>

            <ActionBarGroup>
                {onExport && (
                    <ActionBarItem onSelect={onExport}>
                        <DownloadIcon className="mr-1.5 size-3.5"/>
                        {exportLabel}
                    </ActionBarItem>
                )}

                {onDelete && (
                    <>
                        <ActionBarSeparator orientation="vertical"/>
                        <ActionBarItem
                            onSelect={onDelete}
                            className="text-destructive hover:text-destructive"
                        >
                            <Trash2Icon className="mr-1.5 size-3.5"/>
                            Delete
                        </ActionBarItem>
                    </>
                )}
            </ActionBarGroup>
        </ActionBar>
    )
}