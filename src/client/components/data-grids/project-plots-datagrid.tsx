"use client"

// See the identical note in commission-payments-datagrid.tsx: each
// DataGridColumnHeader reads sort state through builder calls React
// Compiler can't trace, so this file opts out entirely.
"use no memo"

import {useMemo, useState} from "react"
import {useAuth} from "@clerk/react"
import {useMutation, useQueryClient} from "@tanstack/react-query"
import {toast} from "sonner"
import {apiClient} from "@/lib/api.ts"
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
    DataGridTableRowSelect,
    DataGridTableRowSelectAll,
} from "@/components/reui/data-grid/data-grid-table.tsx"
import {
    type ColumnDef,
    type PaginationState,
    type Row,
    type RowSelectionState,
    type SortingState,
    useTable,
} from "@tanstack/react-table"
import {TableActionBar} from "@/components-reusable/reusable-table-action-bar.tsx"
import {useTableCSVExport} from "@/hooks/use-table-csv-export.ts"
import {type ExportColumn} from "@/lib/export-csv.ts"
import {Badge} from "@/components/reui/badge.tsx"
import {Button} from "@/components/ui/button.tsx"
import {Card, CardAction, CardContent, CardFooter, CardHeader} from "@/components/ui/card.tsx"
import {Checkbox} from "@/components/ui/checkbox.tsx"
import {Input} from "@/components/ui/input.tsx"
import {InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput} from "@/components/ui/input-group.tsx"
import {Label} from "@/components/ui/label.tsx"
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover.tsx"
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select.tsx"
import {ReusableEmpty, SearchCardsIllustration} from "@/components-reusable/reusable-empty.tsx"
import {ReusableSheet} from "@/components-reusable/reusable-sheet.tsx"
import {
    type CsvFieldConfig,
    type CsvImportSummary,
    ReusableCSVUploader,
} from "@/components-reusable/reusable-csv-uploader.tsx"
import {
    CheckIcon,
    FilesIcon,
    FunnelIcon,
    LandPlot as LandPlotIcon,
    PlusIcon,
    SearchIcon,
    SquarePenIcon,
    Trash2Icon,
    XIcon,
} from "lucide-react"
import {thousandSeparator} from "@/lib/utils"
import type {ClientProjectPlot} from "@/types/projects.ts"
import type {NewPlot} from "../../../../drizzle/tenant/schema.ts"
import {AddPlotForm} from "@/components/forms/projects/add-plot-form.tsx"

type Availability = "AVAILABLE" | "SOLD"

function formatSize(value: string | null): string {
    if (!value) return "—"
    const numeric = Number(value)
    if (Number.isNaN(numeric)) return "—"
    return `${thousandSeparator(numeric)} m²`
}

function availabilityBadge(availability: Availability) {
    return availability === "AVAILABLE" ? (
        <Badge variant="success-outline">Available</Badge>
    ) : (
        <Badge variant="secondary">Sold</Badge>
    )
}

interface EditDraft {
    plotNumber: string
    surveyedPlotNumber: string
    unsurveyedSize: string
    surveyedSize: string
    availability: Availability
}

function draftFromPlot(plot: ClientProjectPlot): EditDraft {
    return {
        plotNumber: plot.plotNumber,
        surveyedPlotNumber: plot.surveyedPlotNumber ?? "",
        unsurveyedSize: plot.unsurveyedSize,
        surveyedSize: plot.surveyedSize ?? "",
        availability: plot.availability,
    }
}

// Bulk upload field config for plots. `projectId` is deliberately excluded —
// this uploader is always scoped to the project this datagrid belongs to, so
// it's injected onto every row client-side (see handleBulkImport below)
// rather than asked for in the CSV, the same way AddPlotForm sets it per
// line instead of exposing it as an input. Numeric columns use type:
// "number" to match the precedent set by the projects/contacts bulk
// uploaders (bulkProjectRowSchema etc. accept a parsed number for `numeric`
// drizzle columns the same way).
type PlotCsvRow = Omit<NewPlot, "projectId">

const plotFields: CsvFieldConfig<PlotCsvRow>[] = [
    {key: "plotNumber", label: "Plot Number", type: "number", required: true},
    {key: "surveyedPlotNumber", label: "Surveyed Plot Number", type: "string"},
    {key: "unsurveyedSize", label: "Plot Size (m²)", type: "number", required: true},
    {key: "surveyedSize", label: "Surveyed Plot Size (m²)", type: "number"},
    {
        key: "availability",
        label: "Availability",
        type: "enum",
        enumValues: ["AVAILABLE", "SOLD"] as const,
    },
]

// CSV export column config — mirrors exportColumns in contacts-datagrid.tsx.
// Fed to useTableCSVExport, which reads whatever rows are currently
// selected (or the full filtered set for exportAll) straight off the table.
const exportColumns: ExportColumn<ClientProjectPlot>[] = [
    {header: "Plot Number", accessor: (d) => d.plotNumber},
    {header: "Surveyed Plot Number", accessor: (d) => d.surveyedPlotNumber},
    {header: "Plot Size (m²)", accessor: (d) => d.unsurveyedSize},
    {header: "Surveyed Plot Size (m²)", accessor: (d) => d.surveyedSize},
    {header: "Availability", accessor: (d) => d.availability},
    {header: "Current Owner", accessor: (d) => d.contact?.fullName ?? ""},
]

// All editing state lives in table.options.meta instead of being closed
// over inside the columns builder. Cell renderers below are declared at
// module scope so their function identity never changes across renders —
// if they were recreated inline inside a useMemo keyed on editDraft (as
// they were before), flexRender would see a "new component" on every
// keystroke and remount the input, kicking focus out after one character.
interface PlotsTableMeta {
    // Portal target for every Popover/Select rendered by a cell — see the
    // `container` state near the bottom of ProjectPlotsDataGrid. Radix's
    // Popover/Select portal to document.body by default, which is normally
    // fine, but when this whole grid is nested inside another modal Sheet,
    // that Sheet locks pointer interaction to its own content subtree while
    // open. Pinning these portals inside it (rather than document.body)
    // keeps them clickable regardless of nesting depth.
    container: HTMLDivElement | null
    editingRowId: string | null
    editDraft: EditDraft | null
    setEditDraft: (draft: EditDraft) => void
    showSurveyedFields: boolean
    setShowSurveyedFields: (show: boolean) => void
    savingRowId: string | null
    deletingRowIds: Set<string>
    hasSurveyedPlotNumber: boolean
    hasSurveyedSize: boolean
    startEditing: (plot: ClientProjectPlot) => void
    cancelEditing: () => void
    saveEditing: (plotId: string) => void
    handleDelete: (plot: ClientProjectPlot) => void
}

type PlotCellContext = {
    row: { original: ClientProjectPlot }
    table: { options: { meta?: unknown } }
}

function getMeta(table: PlotCellContext["table"]): PlotsTableMeta {
    return table.options.meta as PlotsTableMeta
}

// Click-triggered confirm — not a hover Tooltip, since it needs to hold
// interactive Cancel/Delete buttons — per the "click tooltip which displays
// a confirm component" requirement for row deletion.
function DeletePlotPopover({
                               plotNumber,
                               onConfirm,
                               disabled,
                               container,
                           }: {
    plotNumber: string
    onConfirm: () => void
    disabled?: boolean
    container: HTMLDivElement | null
}) {
    const [open, setOpen] = useState(false)

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    disabled={disabled}
                    aria-label={`Delete plot ${plotNumber}`}
                >
                    <Trash2Icon className="size-3.5 text-destructive"/>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56" align="end" container={container}>
                <div className="space-y-2.5">
                    <p className="text-sm">
                        Delete plot {plotNumber}? This can&apos;t be undone.
                    </p>
                    <div className="flex justify-end gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                                setOpen(false)
                                onConfirm()
                            }}
                        >
                            Delete
                        </Button>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    )
}

// Same accessorKey/id: "id" convention as contacts-datagrid.tsx's selection
// column — reuses the row's own id field rather than a synthetic "select" id.
// Needs the real Row instance (getIsSelected/toggleSelected/table), unlike
// the other cells above which only ever touch `row.original`, so it's typed
// against tanstack's Row directly rather than the narrower PlotCellContext.
function RowSelectCell({row}: { row: Row<DataGridFeatures, ClientProjectPlot> }) {
    return <DataGridTableRowSelect row={row}/>
}

function PlotNumberCell({row, table}: PlotCellContext) {
    const meta = getMeta(table)
    const {
        editingRowId,
        editDraft,
        setEditDraft,
        hasSurveyedPlotNumber,
        hasSurveyedSize,
        showSurveyedFields,
        setShowSurveyedFields
    } = meta

    if (editingRowId === row.original.id && editDraft) {
        return (
            <div className="space-y-1.5">
                <Input
                    className="h-8 w-24"
                    value={editDraft.plotNumber}
                    onChange={(e) => setEditDraft({...editDraft, plotNumber: e.target.value})}
                    aria-label="Plot number"
                />
                {(!hasSurveyedPlotNumber || !hasSurveyedSize) && !showSurveyedFields && (
                    <Button
                        type="button"
                        size="sm"
                        variant="link"
                        className="h-auto p-0 text-xs"
                        onClick={() => setShowSurveyedFields(true)}
                    >
                        <PlusIcon className="size-3"/> Add surveyed data
                    </Button>
                )}
            </div>
        )
    }
    return <div className="text-foreground font-medium">Plot No. {row.original.plotNumber}</div>
}

function SurveyedPlotNumberCell({row, table}: PlotCellContext) {
    const {editingRowId, editDraft, setEditDraft} = getMeta(table)

    if (editingRowId === row.original.id && editDraft) {
        return (
            <Input
                className="h-8 w-28"
                value={editDraft.surveyedPlotNumber}
                onChange={(e) => setEditDraft({...editDraft, surveyedPlotNumber: e.target.value})}
                placeholder="—"
                aria-label="Surveyed plot number"
            />
        )
    }
    return <div className="text-foreground font-medium">{row.original.surveyedPlotNumber ?? "—"}</div>
}

function UnsurveyedSizeCell({row, table}: PlotCellContext) {
    const {editingRowId, editDraft, setEditDraft} = getMeta(table)

    if (editingRowId === row.original.id && editDraft) {
        return (
            <Input
                className="h-8 w-24"
                type="number"
                inputMode="decimal"
                min={0}
                value={editDraft.unsurveyedSize}
                onChange={(e) => setEditDraft({...editDraft, unsurveyedSize: e.target.value})}
                aria-label="Plot size"
            />
        )
    }
    return <div className="text-foreground font-medium">{formatSize(row.original.unsurveyedSize)}</div>
}

function SurveyedSizeCell({row, table}: PlotCellContext) {
    const {editingRowId, editDraft, setEditDraft} = getMeta(table)

    if (editingRowId === row.original.id && editDraft) {
        return (
            <Input
                className="h-8 w-24"
                type="number"
                inputMode="decimal"
                min={0}
                value={editDraft.surveyedSize}
                onChange={(e) => setEditDraft({...editDraft, surveyedSize: e.target.value})}
                placeholder="—"
                aria-label="Surveyed plot size"
            />
        )
    }
    return <div className="text-foreground font-medium">{formatSize(row.original.surveyedSize)}</div>
}

function AvailabilityCell({row, table}: PlotCellContext) {
    const meta = getMeta(table)
    const {
        editingRowId,
        editDraft,
        setEditDraft,
        showSurveyedFields,
        setShowSurveyedFields,
        hasSurveyedPlotNumber,
        hasSurveyedSize,
        container,
    } = meta

    if (editingRowId === row.original.id && editDraft) {
        return (
            <div className="flex items-center gap-1.5">
                <Select
                    value={editDraft.availability}
                    onValueChange={(v) => setEditDraft({...editDraft, availability: v as Availability})}
                >
                    <SelectTrigger className="h-8 w-32">
                        <SelectValue/>
                    </SelectTrigger>
                    <SelectContent container={container}>
                        <SelectItem value="AVAILABLE">Available</SelectItem>
                        <SelectItem value="SOLD">Sold</SelectItem>
                    </SelectContent>
                </Select>
                {showSurveyedFields && (!hasSurveyedPlotNumber || !hasSurveyedSize) && (
                    <Popover defaultOpen>
                        <PopoverTrigger asChild>
                            <Button type="button" size="icon-sm" variant="outline" aria-label="Edit surveyed data">
                                <LandPlotIcon className="size-3.5"/>
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64" align="start" container={container}>
                            <div className="space-y-3">
                                <div className="text-muted-foreground text-xs font-medium">Surveyed data</div>
                                <div className="space-y-2">
                                    <div className="space-y-1">
                                        <Label htmlFor="surveyed-plot-number" className="text-xs">
                                            Surveyed plot number
                                        </Label>
                                        <Input
                                            id="surveyed-plot-number"
                                            className="h-8"
                                            value={editDraft.surveyedPlotNumber}
                                            onChange={(e) =>
                                                setEditDraft({...editDraft, surveyedPlotNumber: e.target.value})
                                            }
                                            placeholder="—"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="surveyed-size" className="text-xs">
                                            Surveyed plot size (m²)
                                        </Label>
                                        <Input
                                            id="surveyed-size"
                                            className="h-8"
                                            type="number"
                                            inputMode="decimal"
                                            min={0}
                                            value={editDraft.surveyedSize}
                                            onChange={(e) =>
                                                setEditDraft({...editDraft, surveyedSize: e.target.value})
                                            }
                                            placeholder="—"
                                        />
                                    </div>
                                </div>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-auto p-0 text-xs text-muted-foreground"
                                    onClick={() => {
                                        setEditDraft({...editDraft, surveyedPlotNumber: "", surveyedSize: ""})
                                        setShowSurveyedFields(false)
                                    }}
                                >
                                    Remove
                                </Button>
                            </div>
                        </PopoverContent>
                    </Popover>
                )}
            </div>
        )
    }
    return availabilityBadge(row.original.availability)
}

function CurrentOwnerCell({row}: PlotCellContext) {
    return <div className="text-foreground font-medium">{row.original.contact?.fullName ?? "—"}</div>
}

function ActionsCell({row, table}: PlotCellContext) {
    const meta = getMeta(table)
    const {
        editingRowId,
        savingRowId,
        deletingRowIds,
        startEditing,
        cancelEditing,
        saveEditing,
        handleDelete,
        container
    } = meta
    const plot = row.original
    const isEditingRow = editingRowId === plot.id
    const isSavingRow = savingRowId === plot.id
    const isDeletingRow = deletingRowIds.has(plot.id)

    if (isEditingRow) {
        return (
            <div className="flex items-center gap-1">
                <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => saveEditing(plot.id)}
                    disabled={isSavingRow}
                    aria-label="Save changes"
                >
                    <CheckIcon className="size-3.5"/>
                </Button>
                <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={cancelEditing}
                    disabled={isSavingRow}
                    aria-label="Cancel editing"
                >
                    <XIcon className="size-3.5"/>
                </Button>
            </div>
        )
    }

    return (
        <div className="flex items-center gap-1">
            <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                onClick={() => startEditing(plot)}
                disabled={editingRowId !== null || isDeletingRow}
                aria-label={`Edit plot ${plot.plotNumber}`}
            >
                <SquarePenIcon className="size-3.5"/>
            </Button>
            <DeletePlotPopover
                plotNumber={plot.plotNumber}
                onConfirm={() => handleDelete(plot)}
                disabled={editingRowId !== null || isDeletingRow}
                container={container}
            />
        </div>
    )
}

interface ProjectPlotsDataGridProps {
    projectId: string
    plots: ClientProjectPlot[]
}

export function ProjectPlotsDataGrid({projectId, plots}: ProjectPlotsDataGridProps) {
    const {getToken} = useAuth()
    const queryClient = useQueryClient()
    const api = apiClient(getToken)

    const [pagination, setPagination] = useState<PaginationState>({pageIndex: 0, pageSize: 8})
    const [sorting, setSorting] = useState<SortingState>([{id: "plotNumber", desc: false}])
    const [searchQuery, setSearchQuery] = useState("")
    const [selectedStatuses, setSelectedStatuses] = useState<Availability[]>([])
    const [isAddOpen, setIsAddOpen] = useState(false)

    const [editingRowId, setEditingRowId] = useState<string | null>(null)
    const [editDraft, setEditDraft] = useState<EditDraft | null>(null)
    const [savingRowId, setSavingRowId] = useState<string | null>(null)
    const [deletingRowIds, setDeletingRowIds] = useState<Set<string>>(new Set())
    const [showSurveyedFields, setShowSurveyedFields] = useState(false)
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

    // Portal target for every Popover/Select/ActionBar this grid renders —
    // see the long comment on PlotsTableMeta.container above. Using a
    // callback-ref-backed state (not a plain ref) so the value is actually
    // available on first render once the node mounts, rather than staying
    // null until some later re-render happens to read ref.current.
    const [container, setContainer] = useState<HTMLDivElement | null>(null)

    const invalidate = () => {
        queryClient.invalidateQueries({queryKey: ["project-statement-data", projectId]})
        queryClient.invalidateQueries({queryKey: ["projects"]})
    }

    const updatePlot = useMutation({
        mutationFn: async ({id, payload}: { id: string; payload: Record<string, unknown> }) => {
            const res = await api.api.plots[":id"].$patch({param: {id}, json: payload})
            if (!res.ok) throw new Error("Failed to update plot")
            return res.json()
        },
        onSuccess: () => {
            invalidate()
            toast.success("Plot updated")
            setEditingRowId(null)
            setEditDraft(null)
            setShowSurveyedFields(false)
        },
        onError: () => {
            toast.error("Failed to update plot")
        },
        onSettled: () => setSavingRowId(null),
    })

    const deletePlot = useMutation({
        mutationFn: async (id: string) => {
            const res = await api.api.plots[":id"].$delete({param: {id}})
            if (!res.ok) throw new Error("Failed to delete plot")
            return res.json()
        },
    })

    const startEditing = (plot: ClientProjectPlot) => {
        setEditingRowId(plot.id)
        setEditDraft(draftFromPlot(plot))
        setShowSurveyedFields(Boolean(plot.surveyedPlotNumber || plot.surveyedSize))
    }

    const cancelEditing = () => {
        setEditingRowId(null)
        setEditDraft(null)
        setShowSurveyedFields(false)
    }

    const saveEditing = (plotId: string) => {
        if (!editDraft) return

        const plotNumber = editDraft.plotNumber.trim()
        const unsurveyedSize = editDraft.unsurveyedSize.trim()
        if (!plotNumber || Number.isNaN(Number(plotNumber))) {
            toast.error("Enter a valid plot number")
            return
        }
        if (!unsurveyedSize || Number.isNaN(Number(unsurveyedSize)) || Number(unsurveyedSize) <= 0) {
            toast.error("Enter a valid plot size")
            return
        }
        const surveyedSize = editDraft.surveyedSize.trim()
        if (surveyedSize && (Number.isNaN(Number(surveyedSize)) || Number(surveyedSize) < 0)) {
            toast.error("Enter a valid surveyed plot size")
            return
        }

        setSavingRowId(plotId)
        updatePlot.mutate({
            id: plotId,
            payload: {
                plotNumber,
                surveyedPlotNumber: editDraft.surveyedPlotNumber.trim() || null,
                unsurveyedSize,
                surveyedSize: surveyedSize || null,
                availability: editDraft.availability,
            },
        })
    }

    const handleDelete = (plot: ClientProjectPlot) => {
        setDeletingRowIds((prev) => new Set(prev).add(plot.id))
        deletePlot.mutate(plot.id, {
            onSuccess: () => {
                invalidate()
                toast.success("Plot deleted")
            },
            onError: () => {
                toast.error("Failed to delete plot")
            },
            onSettled: () => {
                setDeletingRowIds((prev) => {
                    const next = new Set(prev)
                    next.delete(plot.id)
                    return next
                })
            },
        })
    }

    // Bulk import — the CSV never carries projectId (see plotFields above),
    // so it's stamped onto every parsed row here before it's posted, the
    // same way AddPlotForm sets it per line rather than exposing it as an
    // input. Mirrors handleBulkImport in routes/_authed/_org/projects/index.tsx
    // and contacts/index.tsx.
    const handleBulkImport = async (rows: PlotCsvRow[]): Promise<CsvImportSummary> => {
        const res = await api.api.plots.bulk.$post({
            json: {rows: rows.map((row) => ({...row, projectId}))},
        })
        if (!res.ok) {
            throw new Error(`Failed to import plots (${res.status})`)
        }
        const summary = await res.json()
        if (summary.created > 0) {
            invalidate()
        }
        return summary
    }

    const filteredData = useMemo(() => {
        return plots.filter((plot) => {
            const matchesStatus = !selectedStatuses.length || selectedStatuses.includes(plot.availability)

            const searchLower = searchQuery.toLowerCase()
            const matchesSearch =
                !searchQuery ||
                [plot.plotNumber, plot.surveyedPlotNumber, plot.contact?.fullName]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase()
                    .includes(searchLower)

            return matchesStatus && matchesSearch
        })
    }, [plots, searchQuery, selectedStatuses])

    const statusCounts = useMemo(() => {
        return plots.reduce(
            (acc, plot) => {
                acc[plot.availability] = (acc[plot.availability] || 0) + 1
                return acc
            },
            {} as Record<string, number>
        )
    }, [plots])

    // Surveyed plot number / size columns are only shown once at least one
    // plot in the project actually has a value — otherwise they're dead
    // weight in the grid. Checked against the full `plots` list (not
    // filteredData) so columns don't flicker in/out while searching.
    const hasSurveyedPlotNumber = useMemo(
        () => plots.some((p) => p.surveyedPlotNumber && p.surveyedPlotNumber.trim().length > 0),
        [plots]
    )
    const hasSurveyedSize = useMemo(
        () => plots.some((p) => p.surveyedSize && p.surveyedSize.trim().length > 0),
        [plots]
    )

    const handleStatusChange = (checked: boolean, value: Availability) => {
        setSelectedStatuses((prev) => (checked ? [...prev, value] : prev.filter((v) => v !== value)))
        setPagination((prev) => ({...prev, pageIndex: 0}))
    }

    const hasActiveFilters = searchQuery.length > 0 || selectedStatuses.length > 0
    const handleClearFilters = () => {
        setSearchQuery("")
        setSelectedStatuses([])
        setPagination((prev) => ({...prev, pageIndex: 0}))
    }

    // Cell renderers are stable module-level function references (defined
    // above), so this array only needs to be rebuilt when a column actually
    // needs to appear/disappear — not on every keystroke. All the live
    // editing state (editDraft, editingRowId, etc.) flows in separately via
    // table.options.meta, read inside each cell renderer at call time.
    const columns = useMemo<ColumnDef<DataGridFeatures, ClientProjectPlot>[]>(
        () => [
            {
                accessorKey: "id",
                id: "id",
                header: () => <DataGridTableRowSelectAll/>,
                cell: RowSelectCell,
                enableSorting: false,
                size: 35,
                enableResizing: false,
            },
            {
                accessorKey: "plotNumber",
                id: "plotNumber",
                header: ({column}) => <DataGridColumnHeader title="Plot Number" visibility column={column}/>,
                cell: PlotNumberCell,
                enableSorting: true,
                size: 150,
            },
            ...(hasSurveyedPlotNumber
                ? [{
                    accessorKey: "surveyedPlotNumber",
                    id: "surveyedPlotNumber",
                    header: ({column}) => (
                        <DataGridColumnHeader title="Surveyed Plot Number" visibility column={column}/>
                    ),
                    cell: SurveyedPlotNumberCell,
                    enableSorting: true,
                    size: 190,
                } as ColumnDef<DataGridFeatures, ClientProjectPlot>]
                : []),
            {
                accessorKey: "unsurveyedSize",
                id: "unsurveyedSize",
                header: ({column}) => <DataGridColumnHeader title="Plot Size" visibility column={column}/>,
                cell: UnsurveyedSizeCell,
                enableSorting: true,
                size: 140,
            },
            ...(hasSurveyedSize
                ? [{
                    accessorKey: "surveyedSize",
                    id: "surveyedSize",
                    header: ({column}) => (
                        <DataGridColumnHeader title="Surveyed Plot Size" visibility column={column}/>
                    ),
                    cell: SurveyedSizeCell,
                    enableSorting: true,
                    size: 170,
                } as ColumnDef<DataGridFeatures, ClientProjectPlot>]
                : []),
            {
                accessorKey: "availability",
                id: "availability",
                header: ({column}) => <DataGridColumnHeader title="Availability Status" visibility column={column}/>,
                cell: AvailabilityCell,
                enableSorting: true,
                size: 170,
            },
            {
                id: "currentOwner",
                accessorFn: (row) => row.contact?.fullName ?? "",
                header: ({column}) => <DataGridColumnHeader title="Current Owner" visibility column={column}/>,
                cell: CurrentOwnerCell,
                enableSorting: true,
                size: 200,
            },
            {
                id: "actions",
                header: "",
                cell: ActionsCell,
                enableSorting: false,
                enableHiding: false,
                size: 90,
            },
        ],
        [hasSurveyedPlotNumber, hasSurveyedSize]
    )

    const meta: PlotsTableMeta = {
        container,
        editingRowId,
        editDraft,
        setEditDraft,
        showSurveyedFields,
        setShowSurveyedFields,
        savingRowId,
        deletingRowIds,
        hasSurveyedPlotNumber,
        hasSurveyedSize,
        startEditing,
        cancelEditing,
        saveEditing,
        handleDelete,
    }

    const table = useTable({
        features: dataGridFeatures,
        columns,
        data: filteredData,
        pageCount: Math.max(1, Math.ceil(filteredData.length / pagination.pageSize)),
        getRowId: (row: ClientProjectPlot) => row.id,
        enableRowSelection: true,
        state: {pagination, sorting, rowSelection},
        onRowSelectionChange: setRowSelection,
        onPaginationChange: setPagination,
        onSortingChange: setSorting,
        meta,
    })

    // Reads whichever rows are currently checked straight off `table`; falls
    // back to nothing selected until the user ticks a row, same as contacts.
    const {exportSelected} = useTableCSVExport(table, exportColumns)

    // Mirrors handleBulkDelete in contacts-datagrid.tsx: fire all deletes
    // concurrently via mutateAsync (bypassing handleDelete's single-row
    // onSuccess/onError so we get one summary toast instead of N), clear
    // selection immediately so the action bar closes, and let deletingRowIds
    // drive the per-row disabled state on ActionsCell in the meantime.
    const handleBulkDelete = () => {
        if (!table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()) return
        const selectedIds = Object.keys(rowSelection)
        if (selectedIds.length === 0) return

        setDeletingRowIds((prev) => {
            const next = new Set(prev)
            selectedIds.forEach((id) => next.add(id))
            return next
        })
        table.toggleAllRowsSelected(false)

        Promise.all(selectedIds.map((id) => deletePlot.mutateAsync(id)))
            .then(() => {
                invalidate()
                toast.success(`Deleted ${selectedIds.length} plot${selectedIds.length > 1 ? "s" : ""}`)
            })
            .catch(() => {
                invalidate()
                toast.error("Some plots could not be deleted")
            })
            .finally(() => {
                setDeletingRowIds((prev) => {
                    const next = new Set(prev)
                    selectedIds.forEach((id) => next.delete(id))
                    return next
                })
            })
    }

    return (
        // display:contents keeps this node out of layout entirely — it exists
        // only so Popover/Select/ActionBar have a DOM node inside the grid's
        // own subtree to portal into (see the container comment above),
        // never as a visual wrapper.
        <div ref={setContainer} className="contents">
            <DataGrid
                table={table}
                recordCount={filteredData.length}
                tableLayout={{columnsVisibility: true}}
                emptyMessage={
                    hasActiveFilters ? (
                        <ReusableEmpty
                            media={<SearchCardsIllustration/>}
                            title="No matching plots"
                            description="Try adjusting your search or filters."
                            buttonText="Clear filters"
                            onAction={handleClearFilters}
                        />
                    ) : (
                        <ReusableEmpty
                            media={<LandPlotIcon className="size-12"/>}
                            title="No plots yet"
                            description="Plots you add to this project will show up here."
                        />
                    )
                }
            >
                <TableActionBar
                    table={table}
                    onExport={() => exportSelected("plots")}
                    onDelete={handleBulkDelete}
                    portalContainer={container}
                />
                <Card className="w-full gap-3 py-0 mt-4">
                    <CardHeader className="flex items-center justify-between px-3.5 py-2">
                        <div className="flex items-center gap-2.5">
                            <InputGroup className="w-48">
                                <InputGroupAddon align="inline-start">
                                    <SearchIcon/>
                                </InputGroupAddon>
                                <InputGroupInput
                                    placeholder="Search plots..."
                                    value={searchQuery}
                                    onChange={(e) => {
                                        setSearchQuery(e.target.value)
                                        setPagination((prev) => ({...prev, pageIndex: 0}))
                                    }}
                                />
                                {searchQuery.length > 0 && (
                                    <InputGroupAddon align="inline-end">
                                        <InputGroupButton
                                            aria-label="Clear"
                                            title="Clear"
                                            size="icon-xs"
                                            onClick={() => setSearchQuery("")}
                                        >
                                            <XIcon/>
                                        </InputGroupButton>
                                    </InputGroupAddon>
                                )}
                            </InputGroup>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline">
                                        <FunnelIcon/>
                                        Availability
                                        {selectedStatuses.length > 0 && (
                                            <Badge size="sm" variant="info-outline">
                                                {selectedStatuses.length}
                                            </Badge>
                                        )}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-48" align="start" container={container}>
                                    <div className="space-y-3">
                                        <div className="text-muted-foreground text-xs font-medium">Filters</div>
                                        <div className="space-y-3">
                                            {(["AVAILABLE", "SOLD"] as const).map((status) => (
                                                <div key={status} className="flex items-center gap-2.5">
                                                    <Checkbox
                                                        id={`plot-status-${status}`}
                                                        checked={selectedStatuses.includes(status)}
                                                        onCheckedChange={(checked) =>
                                                            handleStatusChange(checked === true, status)
                                                        }
                                                    />
                                                    <Label
                                                        htmlFor={`plot-status-${status}`}
                                                        className="flex grow items-center justify-between gap-1.5 font-normal"
                                                    >
                                                        {status === "AVAILABLE" ? "Available" : "Sold"}
                                                        <span className="text-muted-foreground">
                                                            {statusCounts[status] ?? 0}
                                                        </span>
                                                    </Label>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>
                        <CardAction className="flex items-center gap-2">
                            <Button type="button" onClick={() => setIsAddOpen(true)}>
                                <PlusIcon/> Add Plot
                            </Button>
                            <ReusableSheet
                                title="Plots Bulk Upload"
                                description="Import plots into this project via CSV."
                                trigger={
                                    <Button type="button" variant="outline" size="icon" aria-label="Bulk upload plots">
                                        <FilesIcon className="size-5"/>
                                    </Button>
                                }
                                widthClassName="sm:max-w-full"
                                children={
                                    <ReusableCSVUploader
                                        entityName="plots"
                                        fields={plotFields}
                                        onSubmit={handleBulkImport}
                                    />
                                }
                            />
                        </CardAction>
                    </CardHeader>
                    <CardContent className="p-0.5">
                        <Card className="p-0">
                            <DataGridContainer>
                                <DataGridScrollArea>
                                    <DataGridTable/>
                                </DataGridScrollArea>
                            </DataGridContainer>
                        </Card>
                    </CardContent>
                    <CardFooter className="border-none bg-transparent! px-3.5 py-2">
                        <DataGridPagination rowsPerPageLabel="Plots per Page"/>
                    </CardFooter>
                </Card>
            </DataGrid>

            <AddPlotForm projectId={projectId} open={isAddOpen} onOpenChange={setIsAddOpen}/>
        </div>
    )
}