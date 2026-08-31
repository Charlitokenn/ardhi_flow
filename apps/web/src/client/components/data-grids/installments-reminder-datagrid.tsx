import {useEffect, useMemo, useState} from "react";
import {useAuth} from "@clerk/react";
import {useQuery} from "@tanstack/react-query";
import {apiClient} from "@/lib/api.ts";
import {Badge} from "@/components/reui/badge.tsx";
import {Avatar, AvatarFallback} from "@/components/ui/avatar.tsx";
import {
    DataGrid,
    DataGridContainer,
    dataGridFeatures,
    type DataGridFeatures,
} from "@/components/reui/data-grid/data-grid.tsx";
import {DataGridColumnHeader} from "@/components/reui/data-grid/data-grid-column-header.tsx";
import {DataGridScrollArea} from "@/components/reui/data-grid/data-grid-scroll-area.tsx";
import {DataGridTableRowSelect, DataGridTableRowSelectAll,} from "@/components/reui/data-grid/data-grid-table.tsx";
import {DataGridColumnVisibility} from "@/components/reui/data-grid/data-grid-column-visibility";
import {type ColumnDef, type RowSelectionState, type SortingState, useTable,} from "@tanstack/react-table";
import {toast} from "sonner";
import {Button} from "@/components/ui/button.tsx";
import {Card, CardAction, CardContent, CardHeader,} from "@/components/ui/card.tsx";
import {Checkbox} from "@/components/ui/checkbox.tsx";
import {InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput,} from "@/components/ui/input-group.tsx";
import {Label} from "@/components/ui/label.tsx";
import {Popover, PopoverContent, PopoverTrigger,} from "@/components/ui/popover.tsx";
import {EyeIcon, FunnelIcon, MessageCircleIcon, SearchIcon, Settings2Icon, XIcon,} from "lucide-react";
import {useTableCSVExport} from "../../../../../../packages/api-client/src/index.ts";
import {TableActionBar} from "@/components-reusable/reusable-table-action-bar.tsx";
import {type ExportColumn} from "@/lib/export-csv.ts";
import ReusableSheet from "@/components-reusable/reusable-sheet.tsx";
import {Skeleton} from "@/components/ui/skeleton.tsx";
import {ReusableEmpty, SearchCardsIllustration,} from "@/components-reusable/reusable-empty.tsx";
import {ArchiveIcon} from "@/assets/icons";
import {formatDate, thousandSeparator} from "@/lib/utils.ts";
import {DataGridTableVirtual} from "@/components/reui/data-grid/data-grid-table-virtual";
// ---------------------------------------------------------------------------
// Row shape — matches GET /api/installments (src/worker/routes/installments.ts)
// ---------------------------------------------------------------------------

interface IInstallmentProject {
    id: string;
    projectName: string;
}

interface IInstallmentPlot {
    id: string;
    plotNumber: string;
    project: IInstallmentProject | null;
}

interface IInstallmentClient {
    id: string;
    fullName: string;
    mobileNumber: string | null;
}

interface IInstallmentContract {
    id: string;
    status: "ACTIVE" | "DELINQUENT" | "COMPLETED" | "CANCELLED";
    client: IInstallmentClient | null;
}

interface IInstallmentComment {
    id: string;
    message: string | null;
    eventType: string;
    createdAt: string | null;
}

interface IInstallment {
    id: string;
    contractId: string;
    contractPlotId: string;
    plotId: string;
    installmentNo: number;
    originalDueDate: string;
    dueDate: string;
    rescheduledCount: number;
    amountDue: string;
    amountPaid: string;
    penaltyAmount: string;
    waivedAmount: string;
    status: "DUE" | "PARTIAL" | "PAID";
    paidAt: string | null;
    createdAt: string | null;
    updatedAt: string | null;
    contract: IInstallmentContract | null;
    // Which specific plot within the contract's bucket this installment is
    // for — a multi-plot contract has one full schedule per plot, so this
    // is read directly off the installment, not through the contract.
    plot: IInstallmentPlot | null;
    comments: IInstallmentComment[];
}

// Derived reminder status — separate from the DB's DUE/PARTIAL/PAID status,
// since the reminder view cares about urgency relative to today rather than
// how much of the installment has been paid.
type ReminderStatus = "PAID" | "OVERDUE" | "UPCOMING" | "OPEN";

const REMINDER_STATUSES: ReminderStatus[] = [
    "OVERDUE",
    "UPCOMING",
    "OPEN",
    "PAID",
];

function computeReminderStatus(installment: IInstallment): ReminderStatus {
    if (installment.status === "PAID") return "PAID";

    const due = new Date(installment.dueDate);
    if (Number.isNaN(due.getTime())) return "OPEN";
    due.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffDays = Math.round((due.getTime() - today.getTime()) / 86_400_000);

    if (diffDays < 0) return "OVERDUE";
    if (diffDays <= 7) return "UPCOMING";
    return "OPEN";
}

function reminderStatusBadge(status: ReminderStatus) {
    switch (status) {
        case "PAID":
            return <Badge variant="success-light">Paid</Badge>;
        case "OVERDUE":
            return <Badge variant="destructive-light">Overdue</Badge>;
        case "UPCOMING":
            return <Badge variant="warning-light">Upcoming</Badge>;
        case "OPEN":
        default:
            return <Badge variant="info-light">Open</Badge>;
    }
}

function reminderStatusLabel(status: ReminderStatus): string {
    switch (status) {
        case "PAID":
            return "Paid";
        case "OVERDUE":
            return "Overdue";
        case "UPCOMING":
            return "Upcoming";
        case "OPEN":
        default:
            return "Open";
    }
}

/** Full-row tint to match the status badge colors — subtle enough not to
 * fight the text, but enough to scan a long list at a glance. "Open" rows
 * (due date more than 7 days out) get no tint; they're not yet actionable. */
function reminderRowClassName(status: ReminderStatus): string | undefined {
    switch (status) {
        case "PAID":
            return "bg-success/10 hover:bg-success/15 dark:bg-success/15 dark:hover:bg-success/20";
        case "OVERDUE":
            return "bg-destructive/10 hover:bg-destructive/15 dark:bg-destructive/15 dark:hover:bg-destructive/20";
        case "UPCOMING":
            return "bg-warning/10 hover:bg-warning/15 dark:bg-warning/15 dark:hover:bg-warning/20";
        case "OPEN":
        default:
            return undefined;
    }
}

/** installment_no = 0 is reserved for an optional downpayment installment. */
function formatInstallmentLabel(installmentNo: number): string {
    return installmentNo === 0 ? "Downpayment" : `Installment ${installmentNo}`;
}

function formatTzs(value: string | number | null | undefined) {
    const num = typeof value === "string" ? parseFloat(value) : value;
    if (num === null || num === undefined || Number.isNaN(num)) return "—";
    return `Tshs. ${thousandSeparator(num)}`;
}

function initials(name: string) {
    return name
        .split(" ")
        .filter(Boolean)
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
}

/** Outstanding = what's still owed on this specific installment: the
 * amount due plus any penalty, less whatever's been paid or waived. Never
 * shown negative. */
function computeOutstanding(installment: IInstallment): number {
    const due = parseFloat(installment.amountDue) || 0;
    const penalty = parseFloat(installment.penaltyAmount) || 0;
    const paid = parseFloat(installment.amountPaid) || 0;
    const waived = parseFloat(installment.waivedAmount) || 0;
    return Math.max(0, due + penalty - paid - waived);
}

function latestComment(
    comments: IInstallmentComment[],
): IInstallmentComment | null {
    if (!comments.length) return null;
    return [...comments].sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
    })[0];
}

const exportColumns: ExportColumn<IInstallment>[] = [
    {header: "Due Date", accessor: (d) => d.dueDate},
    {header: "Client", accessor: (d) => d.contract?.client?.fullName ?? null},
    {header: "Project", accessor: (d) => d.plot?.project?.projectName ?? null},
    {header: "Plot", accessor: (d) => d.plot?.plotNumber ?? null},
    {header: "Installment Amount", accessor: (d) => d.amountDue},
    {
        header: "Installment No.",
        accessor: (d) => formatInstallmentLabel(d.installmentNo),
    },
    {header: "Penalty", accessor: (d) => d.penaltyAmount},
    {header: "Payment Date", accessor: (d) => d.paidAt},
    {header: "Paid Amount", accessor: (d) => d.amountPaid},
    {
        header: "Outstanding Amount",
        accessor: (d) => computeOutstanding(d).toString(),
    },
    {
        header: "Comments",
        accessor: (d) => latestComment(d.comments)?.message ?? null,
    },
    {
        header: "Status",
        accessor: (d) => reminderStatusLabel(computeReminderStatus(d)),
    },
];

export function InstallmentsReminderDataGrid() {
    const {getToken} = useAuth();
    const api = apiClient(getToken);

    // const [pagination, setPagination] = useState<PaginationState>({
    //     pageIndex: 0,
    //     pageSize: 8,
    // })
    // Groups installments by client, then — since one client can hold
    // several plots (same project or different ones) — by project and plot
    // so each contract's own schedule stays contiguous, then orders within
    // that schedule by installment number (0 = downpayment first, then 1,
    // 2, 3...). Sorting state is a priority list, applied left to right as
    // tie-breakers. Clicking a column header still re-sorts normally — this
    // only sets the initial/default view.
    const [sorting, setSorting] = useState<SortingState>([
        {id: "clientName", desc: false},
        {id: "projectName", desc: false},
        {id: "plotNumber", desc: false},
        {id: "installmentNo", desc: false},
    ]);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedStatuses, setSelectedStatuses] = useState<ReminderStatus[]>(
        [],
    );

    const [viewingRow, setViewingRow] = useState<IInstallment | null>(null);
    const isViewSheetOpen = viewingRow !== null;

    const installmentsQuery = useQuery({
        queryKey: ["installments"],
        queryFn: async () => {
            const res = await api.api.installments.$get();
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                const message =
                    (body && typeof body === "object" && "error" in body
                        ? (
                            body as {
                                error?: string;
                            }
                        ).error
                        : null) ?? `Failed to load installments (${res.status})`;
                throw new Error(message);
            }
            return res.json();
        },
    });

    useEffect(() => {
        if (installmentsQuery.isError) {
            toast.error(
                installmentsQuery.error instanceof Error
                    ? installmentsQuery.error.message
                    : "Failed to load installments",
            );
        }
    }, [installmentsQuery.isError, installmentsQuery.error]);

    const data = useMemo<IInstallment[]>(
        () => (installmentsQuery.data as unknown as IInstallment[]) ?? [],
        [installmentsQuery.data],
    );

    const filteredData = useMemo(() => {
        return data.filter((item) => {
            const reminderStatus = computeReminderStatus(item);
            const matchesStatus =
                !selectedStatuses.length || selectedStatuses.includes(reminderStatus);

            const searchLower = searchQuery.toLowerCase();
            const matchesSearch =
                !searchQuery ||
                [
                    item.contract?.client?.fullName,
                    item.plot?.project?.projectName,
                    item.plot?.plotNumber,
                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase()
                    .includes(searchLower);

            return matchesStatus && matchesSearch;
        });
    }, [data, searchQuery, selectedStatuses]);

    const statusCounts = useMemo(() => {
        return data.reduce(
            (acc, item) => {
                const key = computeReminderStatus(item);
                acc[key] = (acc[key] || 0) + 1;
                return acc;
            },
            {} as Record<ReminderStatus, number>,
        );
    }, [data]);

    const handleStatusChange = (checked: boolean, value: ReminderStatus) => {
        setSelectedStatuses((prev = []) =>
            checked ? [...prev, value] : prev.filter((v) => v !== value),
        );
    };

    const hasActiveFilters =
        searchQuery.length > 0 || selectedStatuses.length > 0;

    const handleClearFilters = () => {
        setSearchQuery("");
        setSelectedStatuses([]);
    };

    const columns = useMemo<ColumnDef<DataGridFeatures, IInstallment>[]>(
        () => [
            {
                accessorKey: "id",
                id: "id",
                header: () => <DataGridTableRowSelectAll/>,
                cell: ({row}) => <DataGridTableRowSelect row={row}/>,
                enableSorting: false,
                size: 35,
                meta: {skeleton: <Skeleton className="h-4.5 w-4.5"/>},
                enableResizing: false,
            },
            {
                accessorKey: "dueDate",
                id: "dueDate",
                header: ({column}) => (
                    <DataGridColumnHeader
                        title="Due Date"
                        visibility={true}
                        column={column}
                    />
                ),
                cell: (info) => (
                    <div className="text-foreground font-medium">
                        {formatDate(info.getValue() as string)}
                    </div>
                ),
                size: 130,
                meta: {skeleton: <Skeleton className="h-7 w-auto"/>},
                enableSorting: true,
                enableHiding: true,
                enableResizing: true,
            },
            {
                id: "clientName",
                accessorFn: (row) => row.contract?.client?.fullName ?? "",
                header: ({column}) => (
                    <DataGridColumnHeader
                        title="Client"
                        visibility={true}
                        column={column}
                    />
                ),
                cell: ({row}) => {
                    const client = row.original.contract?.client;
                    return (
                        <div className="flex items-center gap-2.5">
                            <Avatar className="size-7">
                                <AvatarFallback>
                                    {initials(client?.fullName ?? "—")}
                                </AvatarFallback>
                            </Avatar>
                            <span className="text-foreground font-medium">
                {client?.fullName ?? "—"}
              </span>
                        </div>
                    );
                },
                size: 210,
                meta: {autoSize: true, skeleton: <Skeleton className="h-7 w-auto"/>},
                enableSorting: true,
                enableHiding: false,
                enableResizing: true,
            },
            {
                id: "projectName",
                accessorFn: (row) => row.plot?.project?.projectName ?? "",
                header: ({column}) => (
                    <DataGridColumnHeader
                        title="Project"
                        visibility={true}
                        column={column}
                    />
                ),
                cell: ({row}) => (
                    <div className="text-foreground font-medium">
                        {row.original.plot?.project?.projectName ?? "—"}
                    </div>
                ),
                size: 170,
                meta: {skeleton: <Skeleton className="h-7 w-auto"/>},
                enableSorting: true,
                enableHiding: true,
                enableResizing: true,
            },
            {
                id: "plotNumber",
                // A client can hold several plots — same project or
                // different ones — so this is its own sortable column
                // rather than folded into the project cell, both for
                // readability and so it can anchor the default sort's
                // per-contract grouping (see the `sorting` state above).
                accessorFn: (row) => row.plot?.plotNumber ?? "",
                header: ({column}) => (
                    <DataGridColumnHeader
                        title="Plot"
                        visibility={true}
                        column={column}
                    />
                ),
                cell: ({row}) => (
                    <div className="text-foreground font-medium">
                        Plot No. {row.original.plot?.plotNumber ?? "—"}
                    </div>
                ),
                size: 110,
                meta: {skeleton: <Skeleton className="h-7 w-auto"/>},
                enableSorting: true,
                enableHiding: true,
                enableResizing: true,
            },
            {
                accessorKey: "installmentNo",
                id: "installmentNo",
                header: ({column}) => (
                    <DataGridColumnHeader
                        title="Installment No."
                        visibility={true}
                        column={column}
                    />
                ),
                cell: (info) => formatInstallmentLabel(info.getValue() as number),
                size: 150,
                meta: {skeleton: <Skeleton className="h-7 w-auto"/>},
                enableSorting: true,
                enableHiding: true,
                enableResizing: true,
            },
            {
                accessorKey: "amountDue",
                id: "amountDue",
                header: ({column}) => (
                    <DataGridColumnHeader
                        title="Installment Amount"
                        visibility={true}
                        column={column}
                    />
                ),
                cell: (info) => (
                    <div className="text-foreground font-medium">
                        {formatTzs(info.getValue() as string)}
                    </div>
                ),
                size: 170,
                meta: {skeleton: <Skeleton className="h-7 w-auto"/>},
                enableSorting: true,
                enableHiding: true,
                enableResizing: true,
            },
            {
                accessorKey: "penaltyAmount",
                id: "penaltyAmount",
                header: ({column}) => (
                    <DataGridColumnHeader
                        title="Penalty"
                        visibility={true}
                        column={column}
                    />
                ),
                cell: (info) => formatTzs(info.getValue() as string),
                size: 140,
                meta: {skeleton: <Skeleton className="h-7 w-auto"/>},
                enableSorting: true,
                enableHiding: true,
                enableResizing: true,
            },
            {
                accessorKey: "paidAt",
                id: "paidAt",
                header: ({column}) => (
                    <DataGridColumnHeader
                        title="Payment Date"
                        visibility={true}
                        column={column}
                    />
                ),
                cell: (info) => {
                    const value = info.getValue() as string | null;
                    return value ? formatDate(value) : "—";
                },
                size: 140,
                meta: {skeleton: <Skeleton className="h-7 w-auto"/>},
                enableSorting: true,
                enableHiding: true,
                enableResizing: true,
            },
            {
                accessorKey: "amountPaid",
                id: "amountPaid",
                header: ({column}) => (
                    <DataGridColumnHeader
                        title="Paid Amount"
                        visibility={true}
                        column={column}
                    />
                ),
                cell: (info) => formatTzs(info.getValue() as string),
                size: 150,
                meta: {skeleton: <Skeleton className="h-7 w-auto"/>},
                enableSorting: true,
                enableHiding: true,
                enableResizing: true,
            },
            {
                id: "outstandingAmount",
                accessorFn: (row) => computeOutstanding(row),
                header: ({column}) => (
                    <DataGridColumnHeader
                        title="Outstanding"
                        visibility={true}
                        column={column}
                    />
                ),
                cell: ({row}) => (
                    <div className="text-foreground font-medium">
                        {formatTzs(computeOutstanding(row.original))}
                    </div>
                ),
                size: 160,
                meta: {skeleton: <Skeleton className="h-7 w-auto"/>},
                enableSorting: true,
                enableHiding: true,
                enableResizing: true,
            },
            {
                id: "comments",
                accessorFn: (row) => latestComment(row.comments)?.message ?? "",
                header: ({column}) => (
                    <DataGridColumnHeader
                        title="Comments"
                        visibility={true}
                        column={column}
                    />
                ),
                cell: ({row}) => {
                    const comment = latestComment(row.original.comments);
                    if (!comment?.message)
                        return <span className="text-muted-foreground">—</span>;
                    return (
                        <div className="flex items-center gap-1.5 max-w-64">
                            <MessageCircleIcon className="size-3.5 text-muted-foreground shrink-0"/>
                            <span className="truncate" title={comment.message}>
                {comment.message}
              </span>
                        </div>
                    );
                },
                size: 220,
                meta: {skeleton: <Skeleton className="h-7 w-auto"/>},
                enableSorting: false,
                enableHiding: true,
                enableResizing: true,
            },
            {
                id: "reminderStatus",
                accessorFn: (row) => computeReminderStatus(row),
                header: ({column}) => (
                    <DataGridColumnHeader
                        title="Status"
                        visibility={true}
                        column={column}
                    />
                ),
                cell: ({row}) =>
                    reminderStatusBadge(computeReminderStatus(row.original)),
                size: 120,
                meta: {skeleton: <Skeleton className="h-7 w-auto"/>},
                enableSorting: true,
                enableHiding: true,
                enableResizing: true,
            },
            {
                id: "actions",
                header: "",
                cell: ({row}) => (
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="View installment details"
                        title="View installment details"
                        onClick={() => setViewingRow(row.original)}
                    >
                        <EyeIcon aria-hidden="true"/>
                    </Button>
                ),
                size: 50,
                enableSorting: false,
                enableHiding: false,
                enableResizing: false,
            },
        ],
        [],
    );

    const [columnOrder, setColumnOrder] = useState<string[]>(
        columns.map((c) => c.id as string),
    );
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

    // const table = useTable({
    //     features: dataGridFeatures,
    //     columns,
    //     data: filteredData,
    //     pageCount: Math.ceil((filteredData.length || 0) / pagination.pageSize),
    //     getRowId: (row: IInstallment) => row.id,
    //     enableRowSelection: true,
    //     state: {pagination, sorting, columnOrder, rowSelection},
    //     initialState: {
    //         columnVisibility: {
    //             id: false,
    //             penaltyAmount: false,
    //             paidAt: false,
    //             amountPaid: false,
    //         },
    //     },
    //     onRowSelectionChange: setRowSelection,
    //     onColumnOrderChange: setColumnOrder,
    //     onPaginationChange: setPagination,
    //     onSortingChange: setSorting,
    // })

    const table = useTable({
        features: dataGridFeatures,

        // Virtualization renders only the visible rows, so we don't
        // need client-side pagination.
        manualPagination: true,

        columns,
        data: filteredData,

        getRowId: (row: IInstallment) => row.id,

        enableRowSelection: true,

        state: {
            sorting,
            columnOrder,
            rowSelection,
        },

        initialState: {
            columnVisibility: {
                id: false,
                penaltyAmount: false,
                paidAt: false,
                amountPaid: false,
            },
        },

        onRowSelectionChange: setRowSelection,
        onColumnOrderChange: setColumnOrder,
        onSortingChange: setSorting,
    });

    const {exportSelected} = useTableCSVExport(table, exportColumns);

    return (
        <>
            <DataGrid
                table={table}
                recordCount={filteredData.length || 0}
                getRowClassName={(row) =>
                    reminderRowClassName(computeReminderStatus(row))
                }
                tableLayout={{
                    columnsPinnable: true,
                    columnsResizable: true,
                    columnsMovable: true,
                    columnsVisibility: true,
                    headerSticky: true,
                }}
                tableClassNames={{
                    headerSticky: "sticky top-0 z-10 bg-background",
                }}
                isLoading={installmentsQuery.isLoading}
                emptyMessage={
                    installmentsQuery.isError ? (
                        <ReusableEmpty
                            media={<ArchiveIcon className="size-12"/>}
                            title="Couldn't load installments"
                            description={
                                installmentsQuery.error instanceof Error
                                    ? installmentsQuery.error.message
                                    : "Something went wrong while loading installments."
                            }
                            buttonText="Retry"
                            onAction={() => installmentsQuery.refetch()}
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
                            title="No installments yet"
                            description="Installments generated from sales contracts will show up here."
                        />
                    )
                }
            >
                <TableActionBar
                    table={table}
                    onExport={() => exportSelected("installments")}
                />
                <Card className="w-full gap-3 py-0 mt-4">
                    <CardHeader className="flex items-center justify-between px-3.5 py-2">
                        <div className="flex items-center gap-2.5">
                            <InputGroup className="w-56">
                                <InputGroupAddon align="inline-start">
                                    <SearchIcon/>
                                </InputGroupAddon>
                                <InputGroupInput
                                    placeholder="Search client or project..."
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
                                        Status
                                        {selectedStatuses.length > 0 && (
                                            <Badge size="sm" variant="info-outline">
                                                {selectedStatuses.length}
                                            </Badge>
                                        )}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-48" align="start">
                                    <div className="space-y-3">
                                        <div className="text-muted-foreground text-xs font-medium">
                                            Filters
                                        </div>
                                        <div className="space-y-3">
                                            {REMINDER_STATUSES.map((status) => (
                                                <div key={status} className="flex items-center gap-2.5">
                                                    <Checkbox
                                                        id={status}
                                                        checked={selectedStatuses.includes(status)}
                                                        onCheckedChange={(checked) =>
                                                            handleStatusChange(checked === true, status)
                                                        }
                                                    />
                                                    <Label
                                                        htmlFor={status}
                                                        className="flex grow items-center justify-between gap-1.5 font-normal"
                                                    >
                                                        {reminderStatusLabel(status)}
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
                        <CardAction/>
                        <DataGridColumnVisibility
                            table={table}
                            trigger={
                                <Button variant="outline" size="sm">
                                    <Settings2Icon aria-hidden="true"/>
                                    Columns
                                </Button>
                            }
                        />
                    </CardHeader>
                    <CardContent className="p-0.5">
                        <Card className="p-0">
                            <DataGridContainer>
                                <DataGridScrollArea className="h-110">
                                    <DataGridTableVirtual estimateSize={50}/>
                                </DataGridScrollArea>
                            </DataGridContainer>
                        </Card>
                    </CardContent>
                    {/*<CardFooter className="border-none bg-transparent! px-3.5 py-2">*/}
                    {/*    <DataGridPagination/>*/}
                    {/*</CardFooter>*/}
                </Card>
            </DataGrid>

            <ReusableSheet
                title="Installment details"
                description="Read-only details for this installment."
                open={isViewSheetOpen}
                onOpenChange={(open) => {
                    if (!open) setViewingRow(null);
                }}
                children={
                    viewingRow && (
                        <div className="space-y-4 text-sm">
                            <div className="space-y-2">
                                <div>
                                    <span className="text-muted-foreground">Client: </span>
                                    {viewingRow.contract?.client?.fullName ?? "—"}
                                </div>
                                <div>
                                    <span className="text-muted-foreground">Project: </span>
                                    {viewingRow.plot?.project?.projectName ?? "—"}
                                </div>
                                <div>
                                    <span className="text-muted-foreground">Plot: </span>
                                    {viewingRow.plot?.plotNumber ?? "—"}
                                </div>
                                <div>
                                    <span className="text-muted-foreground">Installment: </span>
                                    {formatInstallmentLabel(viewingRow.installmentNo)}
                                </div>
                                <div>
                                    <span className="text-muted-foreground">Due Date: </span>
                                    {formatDate(viewingRow.dueDate)}
                                </div>
                                <div>
                  <span className="text-muted-foreground">
                    Installment Amount:{" "}
                  </span>
                                    {formatTzs(viewingRow.amountDue)}
                                </div>
                                <div>
                                    <span className="text-muted-foreground">Penalty: </span>
                                    {formatTzs(viewingRow.penaltyAmount)}
                                </div>
                                <div>
                                    <span className="text-muted-foreground">Paid Amount: </span>
                                    {formatTzs(viewingRow.amountPaid)}
                                </div>
                                <div>
                                    <span className="text-muted-foreground">Payment Date: </span>
                                    {viewingRow.paidAt ? formatDate(viewingRow.paidAt) : "—"}
                                </div>
                                <div>
                                    <span className="text-muted-foreground">Outstanding: </span>
                                    {formatTzs(computeOutstanding(viewingRow))}
                                </div>
                                <div>
                                    <span className="text-muted-foreground">Status: </span>
                                    {reminderStatusBadge(computeReminderStatus(viewingRow))}
                                </div>
                            </div>

                            <div className="space-y-2 border-t pt-3">
                                <div className="text-muted-foreground text-xs font-medium">
                                    Comments
                                </div>
                                {viewingRow.comments.length === 0 ? (
                                    <p className="text-muted-foreground">
                                        No comments logged for this installment.
                                    </p>
                                ) : (
                                    <ul className="space-y-2">
                                        {[...viewingRow.comments]
                                            .sort((a, b) => {
                                                const aTime = a.createdAt
                                                    ? new Date(a.createdAt).getTime()
                                                    : 0;
                                                const bTime = b.createdAt
                                                    ? new Date(b.createdAt).getTime()
                                                    : 0;
                                                return bTime - aTime;
                                            })
                                            .map((comment) => (
                                                <li key={comment.id} className="rounded-md border p-2">
                                                    <p>{comment.message ?? "—"}</p>
                                                    <p className="text-muted-foreground text-xs mt-1">
                                                        {comment.createdAt
                                                            ? formatDate(comment.createdAt)
                                                            : "—"}
                                                    </p>
                                                </li>
                                            ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                    )
                }
            />
        </>
    );
}
