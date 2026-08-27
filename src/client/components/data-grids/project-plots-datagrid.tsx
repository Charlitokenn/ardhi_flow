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
import {DataGridTable} from "@/components/reui/data-grid/data-grid-table.tsx"
import {type ColumnDef, type PaginationState, type SortingState, useTable,} from "@tanstack/react-table"
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
import {LandPlot as LandPlotIcon, PlusIcon, FunnelIcon, SearchIcon, CheckIcon, XIcon, SquarePenIcon, Trash2Icon,} from "lucide-react"
import {thousandSeparator} from "@/lib/utils"
import type {ClientProjectPlot} from "@/types/projects.ts"
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

// Click-triggered confirm — not a hover Tooltip, since it needs to hold
// interactive Cancel/Delete buttons — per the "click tooltip which displays
// a confirm component" requirement for row deletion.
function DeletePlotPopover({
                                plotNumber,
                                onConfirm,
                                disabled,
                            }: {
    plotNumber: string
    onConfirm: () => void
    disabled?: boolean
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
            <PopoverContent className="w-56" align="end">
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
    const [deletingRowId, setDeletingRowId] = useState<string | null>(null)

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
        onSuccess: () => {
            invalidate()
            toast.success("Plot deleted")
        },
        onError: () => {
            toast.error("Failed to delete plot")
        },
        onSettled: () => setDeletingRowId(null),
    })

    const startEditing = (plot: ClientProjectPlot) => {
        setEditingRowId(plot.id)
        setEditDraft(draftFromPlot(plot))
    }

    const cancelEditing = () => {
        setEditingRowId(null)
        setEditDraft(null)
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
        if (surveyedSize && Number.isNaN(Number(surveyedSize))) {
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
        setDeletingRowId(plot.id)
        deletePlot.mutate(plot.id)
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

    const handleStatusChange = (checked: boolean, value: Availability) => {
        setSelectedStatuses((prev) => (checked ? [...prev, value] : prev.filter((v) => v !== value)))
    }

    const hasActiveFilters = searchQuery.length > 0 || selectedStatuses.length > 0
    const handleClearFilters = () => {
        setSearchQuery("")
        setSelectedStatuses([])
    }

    const columns = useMemo<ColumnDef<DataGridFeatures, ClientProjectPlot>[]>(
        () => [
            {
                accessorKey: "plotNumber",
                id: "plotNumber",
                header: ({column}) => <DataGridColumnHeader title="Plot Number" visibility column={column}/>,
                cell: ({row}) =>
                    editingRowId === row.original.id && editDraft ? (
                        <Input
                            className="h-8 w-24"
                            value={editDraft.plotNumber}
                            onChange={(e) => setEditDraft({...editDraft, plotNumber: e.target.value})}
                            aria-label="Plot number"
                        />
                    ) : (
                        <div className="text-foreground font-medium">{row.original.plotNumber}</div>
                    ),
                enableSorting: true,
                size: 150,
            },
            {
                accessorKey: "surveyedPlotNumber",
                id: "surveyedPlotNumber",
                header: ({column}) => <DataGridColumnHeader title="Surveyed Plot Number" visibility column={column}/>,
                cell: ({row}) =>
                    editingRowId === row.original.id && editDraft ? (
                        <Input
                            className="h-8 w-28"
                            value={editDraft.surveyedPlotNumber}
                            onChange={(e) => setEditDraft({...editDraft, surveyedPlotNumber: e.target.value})}
                            placeholder="—"
                            aria-label="Surveyed plot number"
                        />
                    ) : (
                        <div className="text-foreground font-medium">{row.original.surveyedPlotNumber ?? "—"}</div>
                    ),
                enableSorting: true,
                size: 190,
            },
            {
                accessorKey: "unsurveyedSize",
                id: "unsurveyedSize",
                header: ({column}) => <DataGridColumnHeader title="Plot Size" visibility column={column}/>,
                cell: ({row}) =>
                    editingRowId === row.original.id && editDraft ? (
                        <Input
                            className="h-8 w-24"
                            type="number"
                            inputMode="decimal"
                            min={0}
                            value={editDraft.unsurveyedSize}
                            onChange={(e) => setEditDraft({...editDraft, unsurveyedSize: e.target.value})}
                            aria-label="Plot size"
                        />
                    ) : (
                        <div className="text-foreground font-medium">{formatSize(row.original.unsurveyedSize)}</div>
                    ),
                enableSorting: true,
                size: 140,
            },
            {
                accessorKey: "surveyedSize",
                id: "surveyedSize",
                header: ({column}) => <DataGridColumnHeader title="Surveyed Plot Size" visibility column={column}/>,
                cell: ({row}) =>
                    editingRowId === row.original.id && editDraft ? (
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
                    ) : (
                        <div className="text-foreground font-medium">{formatSize(row.original.surveyedSize)}</div>
                    ),
                enableSorting: true,
                size: 170,
            },
            {
                accessorKey: "availability",
                id: "availability",
                header: ({column}) => <DataGridColumnHeader title="Availability Status" visibility column={column}/>,
                cell: ({row}) =>
                    editingRowId === row.original.id && editDraft ? (
                        <Select
                            value={editDraft.availability}
                            onValueChange={(v) => setEditDraft({...editDraft, availability: v as Availability})}
                        >
                            <SelectTrigger className="h-8 w-32">
                                <SelectValue/>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="AVAILABLE">Available</SelectItem>
                                <SelectItem value="SOLD">Sold</SelectItem>
                            </SelectContent>
                        </Select>
                    ) : (
                        availabilityBadge(row.original.availability)
                    ),
                enableSorting: true,
                size: 170,
            },
            {
                id: "currentOwner",
                accessorFn: (row) => row.contact?.fullName ?? "",
                header: ({column}) => <DataGridColumnHeader title="Current Owner" visibility column={column}/>,
                cell: ({row}) => (
                    <div className="text-foreground font-medium">{row.original.contact?.fullName ?? "—"}</div>
                ),
                enableSorting: true,
                size: 200,
            },
            {
                id: "actions",
                header: "",
                cell: ({row}) => {
                    const plot = row.original
                    const isEditingRow = editingRowId === plot.id
                    const isSavingRow = savingRowId === plot.id
                    const isDeletingRow = deletingRowId === plot.id

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
                            />
                        </div>
                    )
                },
                enableSorting: false,
                enableHiding: false,
                size: 90,
            },
        ],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [editingRowId, editDraft, savingRowId, deletingRowId]
    )

    const table = useTable({
        features: dataGridFeatures,
        columns,
        data: filteredData,
        pageCount: Math.max(1, Math.ceil(filteredData.length / pagination.pageSize)),
        getRowId: (row: ClientProjectPlot) => row.id,
        state: {pagination, sorting},
        onPaginationChange: setPagination,
        onSortingChange: setSorting,
    })

    return (
        <>
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
                <Card className="w-full gap-3 py-0">
                    <CardHeader className="flex items-center justify-between px-3.5 py-2">
                        <div className="flex items-center gap-2.5">
                            <InputGroup className="w-48">
                                <InputGroupAddon align="inline-start">
                                    <SearchIcon/>
                                </InputGroupAddon>
                                <InputGroupInput
                                    placeholder="Search plots..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
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
                                <PopoverContent className="w-48" align="start">
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
                        <CardAction>
                            <Button type="button" onClick={() => setIsAddOpen(true)}>
                                <PlusIcon/> Add Plot
                            </Button>
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
                        <DataGridPagination/>
                    </CardFooter>
                </Card>
            </DataGrid>

            <AddPlotForm projectId={projectId} open={isAddOpen} onOpenChange={setIsAddOpen}/>
        </>
    )
}
