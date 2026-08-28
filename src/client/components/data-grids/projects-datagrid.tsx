import {type ReactNode, useEffect, useMemo, useState} from "react";
import {useAuth} from "@clerk/react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {apiClient} from "@/lib/api.ts";
import {Badge} from "@/components/reui/badge.tsx";
import {
    DataGrid,
    DataGridContainer,
    dataGridFeatures,
    type DataGridFeatures,
} from "@/components/reui/data-grid/data-grid.tsx";
import {DataGridColumnHeader} from "@/components/reui/data-grid/data-grid-column-header.tsx";
import {DataGridPagination} from "@/components/reui/data-grid/data-grid-pagination.tsx";
import {DataGridScrollArea} from "@/components/reui/data-grid/data-grid-scroll-area.tsx";
import {
    DataGridTable,
    DataGridTableRowSelect,
    DataGridTableRowSelectAll,
} from "@/components/reui/data-grid/data-grid-table.tsx";
import {
    type ColumnDef,
    type PaginationState,
    type Row,
    type RowSelectionState,
    type SortingState,
    useTable,
} from "@tanstack/react-table";
import {toast} from "sonner";
import {Avatar, AvatarFallback} from "@/components/ui/avatar.tsx";
import {Button} from "@/components/ui/button.tsx";
import {Card, CardAction, CardContent, CardFooter, CardHeader,} from "@/components/ui/card.tsx";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import {InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput,} from "@/components/ui/input-group.tsx";
import {EyeDashedIcon, MoreHorizontalIcon, SearchIcon, SquarePenIcon, Trash2Icon, XIcon,} from "lucide-react";
import {useTableCSVExport} from "@/hooks/use-table-csv-export.ts";
import {TableActionBar} from "@/components-reusable/reusable-table-action-bar.tsx";
import {type ExportColumn} from "@/lib/export-csv.ts";
import ReusableSheet from "@/components-reusable/reusable-sheet.tsx";
import {Skeleton} from "@/components/ui/skeleton.tsx";
import {ReusableEmpty, SearchCardsIllustration,} from "@/components-reusable/reusable-empty.tsx";
import {ArchiveIcon} from "@/assets/icons";
import {ReusableDeleteDialog} from "@/components-reusable/reusable-delete.tsx";
import {AddEditProjectsForm, type ProjectRecord} from "@/components/forms/projects/add-edit-projects-form.tsx";
import {ProjectsView} from "@/components/views/projects-view.tsx";
import type {ClientProject} from "@/types/projects.ts";
import {TabsScrollSwitchSkeleton} from "@/components/custom-tabs-vertical.tsx";

interface IPlot {
    id: string;
    availability: "AVAILABLE" | "SOLD";
}

// Extends `ProjectRecord` with the extra fields the grid itself needs
// (`plots`, `createdAt`) — same shape used for `IContact`/`ContactRecord` in
// contacts-datagrid.tsx. The list endpoint already returns the full project
// row, so a grid row carries everything the add/edit form needs to open for
// editing with no extra fetch/seed step.
interface IProject extends ProjectRecord {
    createdAt: string | null;
    plots: IPlot[];
}

const exportColumns: ExportColumn<IProject>[] = [
    {header: "ID", accessor: (d) => d.id},
    {header: "Project Name", accessor: (d) => d.projectName},
    {header: "Region", accessor: (d) => d.region},
    {header: "District", accessor: (d) => d.district},
    {header: "Project Owner", accessor: (d) => d.projectOwner},
    {header: "Number of Plots", accessor: (d) => d.numberOfPlots},
    {header: "Acquisition Value", accessor: (d) => d.acquisitionValue},
    {header: "Acquisition Date", accessor: (d) => d.acquisitionDate},
    {header: "TP Status", accessor: (d) => d.tpStatus},
    {header: "Survey Status", accessor: (d) => d.surveyStatus},
];

function initials(name: string) {
    return name
        .split(" ")
        .filter(Boolean)
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
}

function formatCurrency(value: string | null) {
    if (!value) return "—";
    const num = Number(value);
    if (Number.isNaN(num)) return "—";
    return new Intl.NumberFormat("en-TZ", {
        style: "currency",
        currency: "TZS",
        maximumFractionDigits: 0,
    }).format(num);
}

function formatDate(value: string | null) {
    if (!value) return "—";

    // Handle YYYY-MM-DD date-only strings as local calendar dates
    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (dateOnlyMatch) {
        const [, year, month, day] = dateOnlyMatch;
        const date = new Date(Number(year), Number(month) - 1, Number(day));
        if (!Number.isNaN(date.getTime())) {
            return date.toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
            });
        }
    }

    // Fallback to standard parsing for other formats
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
}

function ActionsCell({
                         row,
                         onEdit,
                         onView,
                         onDelete,
                         disabled,
                     }: {
    row: Row<DataGridFeatures, IProject>;
    onEdit: (data: IProject) => void;
    onView: (data: IProject) => void;
    onDelete: (data: IProject) => void;
    disabled?: boolean;
}) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    className="size-7"
                    size="icon"
                    variant="ghost"
                    disabled={disabled}
                >
                    <MoreHorizontalIcon/>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="left" align="start">
                <DropdownMenuItem
                    onClick={() => onEdit(row.original)}
                    className="cursor-pointer"
                >
                    <SquarePenIcon/> Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                    onClick={() => onView(row.original)}
                    className="cursor-pointer"
                >
                    <EyeDashedIcon/> View
                </DropdownMenuItem>
                <DropdownMenuSeparator/>
                <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onDelete(row.original)}
                    className="cursor-pointer"
                >
                    <Trash2Icon/> Delete
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

const DELETE_ANIMATION_MS = 600;

// Owns loading the view sheet's data — the project's full plots (each with
// its current holding contact) and its LAND_ACQUISITION payments (each with
// the supplier/payee) — mirroring ViewSheetContent in contacts-datagrid.tsx.
// ProjectsView never fetches on its own.
function ViewSheetContent({viewingRowId}: { viewingRowId: string }) {
    const {getToken} = useAuth();
    const api = apiClient(getToken);

    const projectQuery = useQuery({
        queryKey: ["project-statement-data", viewingRowId],
        queryFn: async () => {
            const res = await api.api.projects[":id"]["statement-data"].$get({param: {id: viewingRowId}});
            if (!res.ok) throw new Error(`Failed to load project details (${res.status})`);
            return res.json() as Promise<ClientProject>;
        },
    });

    if (projectQuery.isError) {
        return (
            <div className="mt-8 ml-2 flex flex-col items-start gap-3">
                <p className="text-sm text-destructive">
                    {projectQuery.error instanceof Error ? projectQuery.error.message : "Failed to load project details"}
                </p>
                <Button variant="outline" size="sm" onClick={() => projectQuery.refetch()}>
                    Retry
                </Button>
            </div>
        );
    }

    if (projectQuery.isLoading || !projectQuery.data) {
        return <TabsScrollSwitchSkeleton tabCount={2}/>;
    }

    return <ProjectsView project={projectQuery.data}/>;
}

export function ProjectsDataGrid() {
    const {getToken} = useAuth();
    const queryClient = useQueryClient();
    const api = apiClient(getToken);

    const [pagination, setPagination] = useState<PaginationState>({
        pageIndex: 0,
        pageSize: 8,
    });
    const [sorting, setSorting] = useState<SortingState>([
        {id: "projectName", desc: false},
    ]);
    const [searchQuery, setSearchQuery] = useState("");

    const [viewingRow, setViewingRow] = useState<IProject | null>(null);
    const isViewSheetOpen = viewingRow !== null;

    const [editingRow, setEditingRow] = useState<IProject | null>(null);
    const isEditSheetOpen = editingRow !== null;

    const [deletingRow, setDeletingRow] = useState<IProject | null>(null);
    const isDeleteDialogOpen = deletingRow !== null;
    const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

    const projectsQuery = useQuery({
        queryKey: ["projects"],
        queryFn: async () => {
            const res = await api.api.projects.$get();
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                const message =
                    (body && typeof body === "object" && "error" in body
                        ? (
                            body as {
                                error?: string;
                            }
                        ).error
                        : null) ?? `Failed to load projects (${res.status})`;
                throw new Error(message);
            }
            return res.json();
        },
    });

    useEffect(() => {
        if (projectsQuery.isError) {
            toast.error(
                projectsQuery.error instanceof Error
                    ? projectsQuery.error.message
                    : "Failed to load projects",
            );
        }
    }, [projectsQuery.isError, projectsQuery.error]);

    const deleteProject = useMutation({
        mutationFn: async (id: string) => {
            const res = await api.api.projects[":id"].$delete({param: {id}});
            if (!res.ok) throw new Error("Failed to delete project");
            return res.json();
        },
    });

    const data = useMemo<IProject[]>(
        () => (projectsQuery.data as IProject[]) ?? [],
        [projectsQuery.data],
    );

    const filteredData = useMemo(() => {
        return data.filter((item) => {
            const searchLower = searchQuery.toLowerCase();
            const matchesSearch =
                !searchQuery ||
                [item.projectName, item.region, item.district, item.projectOwner]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase()
                    .includes(searchLower);

            return matchesSearch;
        });
    }, [data, searchQuery]);

    const hasActiveFilters = searchQuery.length > 0;

    const handleClearFilters = () => {
        setSearchQuery("");
    };

    const renderWithDeleteSkeleton = (
        skeleton: ReactNode,
        render: (row: Row<DataGridFeatures, IProject>) => ReactNode,
    ) => {
        return ({row}: { row: Row<DataGridFeatures, IProject> }) =>
            deletingIds.has(row.original.id) ? skeleton : render(row);
    };

    const columns = useMemo<ColumnDef<DataGridFeatures, IProject>[]>(
        () => [
            {
                accessorKey: "id",
                id: "id",
                header: () => <DataGridTableRowSelectAll/>,
                cell: renderWithDeleteSkeleton(
                    <Skeleton className="h-4.5 w-4.5"/>,
                    (row) => <DataGridTableRowSelect row={row}/>,
                ),
                enableSorting: false,
                size: 35,
                meta: {skeleton: <Skeleton className="h-4.5 w-4.5"/>},
                enableResizing: false,
            },
            {
                accessorKey: "projectName",
                id: "projectName",
                header: ({column}) => (
                    <DataGridColumnHeader
                        title="Project"
                        visibility={true}
                        column={column}
                    />
                ),
                cell: renderWithDeleteSkeleton(
                    <Skeleton className="h-7 w-auto"/>,
                    (row) => {
                        const availablePlots =
                            row.original.plots?.filter(
                                (plot) => plot.availability === "AVAILABLE",
                            ).length ?? 0;

                        return (
                            <div className="flex items-center gap-3">
                                <Avatar className="size-8">
                                    <AvatarFallback>
                                        {initials(row.original.projectName)}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="space-y-px">
                                    <div className="text-foreground font-medium">
                                        {row.original.projectName}
                                    </div>
                                    <div className="text-muted-foreground">
                                        {[row.original.region, row.original.district]
                                            .filter(Boolean)
                                            .join(", ") || "—"}
                                    </div>
                                    <Badge
                                        variant={availablePlots > 0 ? "success-light" : "warning"}
                                    >
                                        {availablePlots > 0
                                            ? `${availablePlots} Plots Available`
                                            : "Sold Out"}
                                    </Badge>
                                </div>
                            </div>
                        );
                    },
                ),
                size: 260,
                meta: {autoSize: true, skeleton: <Skeleton className="h-7 w-auto"/>},
                enableSorting: true,
                enableHiding: false,
                enableResizing: true,
            },
            {
                accessorKey: "acquisitionDate",
                id: "acquisitionDate",
                header: ({column}) => (
                    <DataGridColumnHeader
                        title="Acquired"
                        visibility={true}
                        column={column}
                    />
                ),
                cell: renderWithDeleteSkeleton(
                    <Skeleton className="h-7 w-auto"/>,
                    (row) => (
                        <div className="text-foreground font-medium">
                            {formatDate(row.original.acquisitionDate)}
                        </div>
                    ),
                ),
                size: 140,
                meta: {skeleton: <Skeleton className="h-7 w-auto"/>},
                enableSorting: true,
                enableHiding: true,
                enableResizing: true,
            },
            {
                accessorKey: "acquisitionValue",
                id: "acquisitionValue",
                header: ({column}) => (
                    <DataGridColumnHeader
                        title="Acquisition Value"
                        visibility={true}
                        column={column}
                    />
                ),
                cell: renderWithDeleteSkeleton(
                    <Skeleton className="h-7 w-auto"/>,
                    (row) => (
                        <div className="text-foreground font-medium">
                            {formatCurrency(row.original.acquisitionValue)}
                        </div>
                    ),
                ),
                size: 170,
                meta: {skeleton: <Skeleton className="h-7 w-auto"/>},
                enableSorting: true,
                enableHiding: true,
                enableResizing: true,
            },
            {
                accessorFn: (row) => row.plots?.length ?? 0,
                id: "numberOfPlots",
                header: ({column}) => (
                    <DataGridColumnHeader
                        title="Number of Plots"
                        visibility={true}
                        column={column}
                    />
                ),
                cell: renderWithDeleteSkeleton(
                    <Skeleton className="h-7 w-auto"/>,
                    (row) => (
                        <span className="text-foreground font-medium">
              {row.original.plots?.length ?? 0}
            </span>
                    ),
                ),
                size: 150,
                meta: {skeleton: <Skeleton className="h-7 w-auto"/>},
                enableSorting: true,
                enableHiding: true,
                enableResizing: true,
            },
            {
                id: "actions",
                header: "",
                cell: renderWithDeleteSkeleton(
                    <Skeleton className="h-6 w-6"/>,
                    (row) => (
                        <ActionsCell
                            row={row}
                            onEdit={(rowData) => setEditingRow(rowData)}
                            onView={(rowData) => setViewingRow(rowData)}
                            onDelete={(rowData) => setDeletingRow(rowData)}
                            disabled={deletingIds.has(row.original.id)}
                        />
                    ),
                ),
                size: 60,
                meta: {skeleton: <Skeleton className="h-6 w-6"/>},
                enableSorting: false,
                enableHiding: false,
                enableResizing: false,
            },
        ],
        [deletingIds, renderWithDeleteSkeleton],
    );

    const [columnOrder, setColumnOrder] = useState<string[]>(
        columns.map((c) => c.id as string),
    );
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

    const table = useTable({
        features: dataGridFeatures,
        columns,
        data: filteredData,
        pageCount: Math.ceil((filteredData.length || 0) / pagination.pageSize),
        getRowId: (row: IProject) => row.id,
        enableRowSelection: true,
        state: {pagination, sorting, columnOrder, rowSelection},
        onRowSelectionChange: setRowSelection,
        onColumnOrderChange: setColumnOrder,
        onPaginationChange: setPagination,
        onSortingChange: setSorting,
    });

    const {exportSelected} = useTableCSVExport(table, exportColumns);

    const handleConfirmDelete = () => {
        if (!deletingRow) return;
        const {id, projectName} = deletingRow;
        setDeletingIds((prev) => new Set(prev).add(id));
        setDeletingRow(null);

        deleteProject.mutate(id, {
            onSuccess: () => {
                setTimeout(() => {
                    queryClient.invalidateQueries({queryKey: ["projects"]});
                    setDeletingIds((prev) => {
                        const next = new Set(prev);
                        next.delete(id);
                        return next;
                    });
                    toast.success(`Deleted ${projectName}`);
                }, DELETE_ANIMATION_MS);
            },
            onError: () => {
                setDeletingIds((prev) => {
                    const next = new Set(prev);
                    next.delete(id);
                    return next;
                });
                toast.error(`Failed to delete ${projectName}`);
            },
        });
    };

    const handleBulkDelete = () => {
        const selectedIds = Object.keys(rowSelection);
        if (selectedIds.length === 0) return;

        setDeletingIds((prev) => {
            const next = new Set(prev);
            selectedIds.forEach((id) => next.add(id));
            return next;
        });
        table.toggleAllRowsSelected(false);

        Promise.all(selectedIds.map((id) => deleteProject.mutateAsync(id)))
            .then(() => {
                queryClient.invalidateQueries({queryKey: ["projects"]});
                setDeletingIds((prev) => {
                    const next = new Set(prev);
                    selectedIds.forEach((id) => next.delete(id));
                    return next;
                });
                toast.success(`Deleted ${selectedIds.length} project(s)`);
            })
            .catch(() => {
                queryClient.invalidateQueries({queryKey: ["projects"]});
                setDeletingIds((prev) => {
                    const next = new Set(prev);
                    selectedIds.forEach((id) => next.delete(id));
                    return next;
                });
                toast.error("Some projects could not be deleted");
            });
    };

    return (
        <>
            <DataGrid
                table={table}
                recordCount={filteredData.length || 0}
                tableLayout={{
                    columnsPinnable: true,
                    columnsResizable: true,
                    columnsMovable: true,
                    columnsVisibility: true,
                }}
                isLoading={projectsQuery.isLoading}
                emptyMessage={
                    projectsQuery.isError ? (
                        <ReusableEmpty
                            media={<ArchiveIcon className="size-12"/>}
                            title="Couldn't load projects"
                            description={
                                projectsQuery.error instanceof Error
                                    ? projectsQuery.error.message
                                    : "Something went wrong while loading projects."
                            }
                            buttonText="Retry"
                            onAction={() => projectsQuery.refetch()}
                        />
                    ) : hasActiveFilters ? (
                        <ReusableEmpty
                            media={<SearchCardsIllustration/>}
                            title="No matching results"
                            description="Try adjusting your search or filters."
                            buttonText="Clear filters"
                            onAction={handleClearFilters}
                        />
                    ) : (
                        <ReusableEmpty
                            media={<ArchiveIcon className="size-12"/>}
                            title="No projects yet"
                            description="Projects you add will show up here."
                        />
                    )
                }
            >
                <TableActionBar
                    table={table}
                    onExport={() => exportSelected("projects")}
                    onDelete={handleBulkDelete}
                />
                <Card className="w-full gap-3 py-0 mt-4">
                    <CardHeader className="flex items-center justify-between px-3.5 py-2">
                        <div className="flex items-center gap-2.5">
                            <InputGroup className="w-48">
                                <InputGroupAddon align="inline-start">
                                    <SearchIcon/>
                                </InputGroupAddon>
                                <InputGroupInput
                                    placeholder="Search projects..."
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
                        </div>
                        <CardAction/>
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
                        <DataGridPagination
                            rowsPerPageLabel="Projects per Page"
                            sizes={[8, 16, 32, 50, 100, 500]}
                        />
                    </CardFooter>
                </Card>
            </DataGrid>

            <ReusableSheet
                title="Project Details"
                widthClassName="sm:max-w-full"
                open={isViewSheetOpen}
                onOpenChange={(open) => {
                    if (!open) setViewingRow(null);
                }}
                children={
                    viewingRow && (
                        <ViewSheetContent viewingRowId={viewingRow.id}/>
                    )
                }
            />

            {editingRow && (
                <AddEditProjectsForm
                    mode="edit"
                    projectId={editingRow.id}
                    initialData={editingRow}
                    open={isEditSheetOpen}
                    onOpenChange={(open) => {
                        if (!open) setEditingRow(null);
                    }}
                    onSuccess={() => setEditingRow(null)}
                />
            )}

            <ReusableDeleteDialog
                open={isDeleteDialogOpen}
                onOpenChange={(open) => {
                    if (!open) setDeletingRow(null);
                }}
                icon={<Trash2Icon className="size-5"/>}
                description={`This action will delete ${deletingRow?.projectName} project`}
                onDelete={handleConfirmDelete}
            />
        </>
    );
}
