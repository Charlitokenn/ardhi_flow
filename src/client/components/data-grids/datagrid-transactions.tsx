import {type ReactNode, useEffect, useMemo, useState} from "react"
import {useAuth} from "@clerk/react"
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query"
import {apiClient} from "@/lib/api.ts"
import {Badge} from "@/components/reui/badge.tsx"
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
import {toast} from "sonner"
import {Avatar, AvatarFallback} from "@/components/ui/avatar.tsx"
import {Button} from "@/components/ui/button.tsx"
import {Card, CardAction, CardContent, CardFooter, CardHeader,} from "@/components/ui/card.tsx"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx"
import {InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput,} from "@/components/ui/input-group.tsx"
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue,} from "@/components/ui/select.tsx"
import {
    ArrowDownCircleIcon,
    ArrowUpCircleIcon,
    EyeDashedIcon,
    ListIcon,
    MoreHorizontalIcon,
    SearchIcon,
    SquarePenIcon,
    Trash2Icon,
    TrendingUpIcon,
    XIcon,
} from "lucide-react"
import {useTableCSVExport} from "@/hooks/use-table-csv-export.ts"
import {TableActionBar} from "@/components-reusable/reusable-table-action-bar.tsx"
import {type ExportColumn} from "@/lib/export-csv.ts"
import ReusableSheet from "@/components-reusable/reusable-sheet.tsx"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx"
import {Skeleton} from "@/components/ui/skeleton.tsx"
import {ReusableEmpty, SearchCardsIllustration,} from "@/components-reusable/reusable-empty.tsx"
import {ArchiveIcon} from "@/assets/icons"

interface IPayment {
    id: string
    contractId: string
    clientContactId: string
    accountId: string | null
    direction: "IN" | "OUT"
    amount: string
    receivedAt: string
    method: string | null
    reference: string | null
    client?: { fullName: string } | null
    account?: { name?: string } | null
}

interface IExpense {
    id: string
    category: string
    description: string | null
    amount: string
    accountId: string | null
    payeeContactId: string | null
    projectId: string | null
    paidAt: string
    method: string | null
    reference?: string | null
    payee?: { fullName: string } | null
    account?: { name?: string } | null
}

interface ITransaction {
    id: string
    kind: "payment" | "expense"
    title: string
    subtitle: string
    amount: number
    isIncome: boolean
    date: string
    method: string | null
    raw: IPayment | IExpense
}

const exportColumns: ExportColumn<ITransaction>[] = [
    {header: "ID", accessor: (d) => d.id},
    {header: "Type", accessor: (d) => d.kind},
    {header: "Merchant", accessor: (d) => d.title},
    {header: "Amount", accessor: (d) => d.amount},
    {header: "Date", accessor: (d) => d.date},
]

function initials(name: string) {
    return name
        .split(" ")
        .filter(Boolean)
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
}

function shortId(id: string) {
    return id.replace(/-/g, "").slice(0, 8).toUpperCase()
}

function formatDate(value: string | null | undefined) {
    if (!value) return "—"
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return "—"
    return date.toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
    })
}

function formatCurrency(amount: number) {
    return amount.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
    })
}

function toTransactions(payments: IPayment[], expenses: IExpense[]): ITransaction[] {
    const paymentTx: ITransaction[] = payments.map((p) => ({
        id: `payment-${p.id}`,
        kind: "payment",
        title: p.client?.fullName ?? "Unknown client",
        subtitle: "Client Payment",
        amount: Number.parseFloat(p.amount) || 0,
        isIncome: p.direction === "IN",
        date: p.receivedAt,
        method: p.method ?? p.reference ?? null,
        raw: p,
    }))

    const expenseTx: ITransaction[] = expenses.map((e) => ({
        id: `expense-${e.id}`,
        kind: "expense",
        title: e.payee?.fullName ?? e.description ?? "Expense",
        subtitle: e.category,
        amount: Number.parseFloat(e.amount) || 0,
        isIncome: false,
        date: e.paidAt,
        method: e.method ?? e.reference ?? null,
        raw: e,
    }))

    return [...paymentTx, ...expenseTx].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )
}

function transactionIdLabel(tx: ITransaction) {
    if (tx.kind === "payment") {
        const payment = tx.raw as IPayment
        return payment.reference || payment.method || `TXN_${shortId(payment.id)}`
    }
    const expense = tx.raw as IExpense
    return expense.reference || `INV_${shortId(expense.id)}`
}

function ActionsCell({
                         row,
                         onEdit,
                         onView,
                         onDelete,
                         disabled,
                     }: {
    row: Row<DataGridFeatures, ITransaction>
    onEdit: (data: ITransaction) => void
    onView: (data: ITransaction) => void
    onDelete: (data: ITransaction) => void
    disabled?: boolean
}) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button className="size-7" size="icon" variant="ghost" disabled={disabled}>
                    <MoreHorizontalIcon/>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="left" align="start">
                <DropdownMenuItem onClick={() => onEdit(row.original)} className="cursor-pointer">
                    <SquarePenIcon/> Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onView(row.original)} className="cursor-pointer">
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
    )
}

const DELETE_ANIMATION_MS = 600

type TypeFilter = "all" | "income" | "expense"

export function DatagridTransactions() {
    const {getToken} = useAuth()
    const queryClient = useQueryClient()
    const api = apiClient(getToken)

    const [pagination, setPagination] = useState<PaginationState>({
        pageIndex: 0,
        pageSize: 8,
    })
    const [sorting, setSorting] = useState<SortingState>([{id: "date", desc: true}])
    const [searchQuery, setSearchQuery] = useState("")
    const [methodFilter, setMethodFilter] = useState<string>("all")
    const [accountFilter, setAccountFilter] = useState<string>("all")
    const [typeFilter, setTypeFilter] = useState<TypeFilter>("all")

    const [viewingRow, setViewingRow] = useState<ITransaction | null>(null)
    const isViewSheetOpen = viewingRow !== null

    const [deletingRow, setDeletingRow] = useState<ITransaction | null>(null)
    const isDeleteDialogOpen = deletingRow !== null
    const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())

    const paymentsQuery = useQuery({
        queryKey: ["payments"],
        queryFn: async () => {
            const res = await api.api.payments.$get()
            if (!res.ok) {
                const body = await res.json().catch(() => null)
                const message = (body && typeof body === "object" && "error" in body ? (body as {
                        error?: string
                    }).error : null)
                    ?? `Failed to load payments (${res.status})`
                throw new Error(message)
            }
            return res.json()
        },
    })

    const expensesQuery = useQuery({
        queryKey: ["expenses"],
        queryFn: async () => {
            const res = await api.api.expenses.$get()
            if (!res.ok) {
                const body = await res.json().catch(() => null)
                const message = (body && typeof body === "object" && "error" in body ? (body as {
                        error?: string
                    }).error : null)
                    ?? `Failed to load expenses (${res.status})`
                throw new Error(message)
            }
            return res.json()
        },
    })

    useEffect(() => {
        if (paymentsQuery.isError) {
            toast.error(paymentsQuery.error instanceof Error ? paymentsQuery.error.message : "Failed to load payments")
        }
    }, [paymentsQuery.isError, paymentsQuery.error])

    useEffect(() => {
        if (expensesQuery.isError) {
            toast.error(expensesQuery.error instanceof Error ? expensesQuery.error.message : "Failed to load expenses")
        }
    }, [expensesQuery.isError, expensesQuery.error])

    const deletePayment = useMutation({
        mutationFn: async (id: string) => {
            const res = await api.api.payments[":id"].$delete({param: {id}})
            if (!res.ok) throw new Error("Failed to delete payment")
            return res.json()
        },
    })

    const deleteExpense = useMutation({
        mutationFn: async (id: string) => {
            const res = await api.api.expenses[":id"].$delete({param: {id}})
            if (!res.ok) throw new Error("Failed to delete expense")
            return res.json()
        },
    })

    const data = useMemo<ITransaction[]>(
        () =>
            toTransactions(
                (paymentsQuery.data ?? []) as unknown as IPayment[],
                (expensesQuery.data ?? []) as unknown as IExpense[]
            ),
        [paymentsQuery.data, expensesQuery.data]
    )

    const methodOptions = useMemo(() => {
        const methods = new Set<string>()
        data.forEach((tx) => {
            if (tx.method) methods.add(tx.method)
        })
        return Array.from(methods)
    }, [data])

    const accountOptions = useMemo(() => {
        const accounts = new Set<string>()
        data.forEach((tx) => {
            const name = tx.raw.account?.name
            if (name) accounts.add(name)
        })
        return Array.from(accounts)
    }, [data])

    const filteredData = useMemo(() => {
        return data.filter((tx) => {
            const matchesType =
                typeFilter === "all" ||
                (typeFilter === "income" && tx.isIncome) ||
                (typeFilter === "expense" && !tx.isIncome)

            const matchesMethod = methodFilter === "all" || tx.method === methodFilter

            const matchesAccount = accountFilter === "all" || tx.raw.account?.name === accountFilter

            const searchLower = searchQuery.toLowerCase()
            const matchesSearch =
                !searchQuery ||
                [tx.title, tx.subtitle, tx.method, transactionIdLabel(tx)]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase()
                    .includes(searchLower)

            return matchesType && matchesMethod && matchesAccount && matchesSearch
        })
    }, [data, searchQuery, methodFilter, accountFilter, typeFilter])

    const stats = useMemo(() => {
        const totalIn = data.filter((tx) => tx.isIncome).reduce((sum, tx) => sum + tx.amount, 0)
        const totalOut = data.filter((tx) => !tx.isIncome).reduce((sum, tx) => sum + tx.amount, 0)
        const largest = data.reduce((max, tx) => Math.max(max, tx.amount), 0)
        return {totalIn, totalOut, largest, count: data.length}
    }, [data])

    const hasActiveFilters =
        searchQuery.length > 0 || methodFilter !== "all" || accountFilter !== "all" || typeFilter !== "all"

    const handleClearFilters = () => {
        setSearchQuery("")
        setMethodFilter("all")
        setAccountFilter("all")
        setTypeFilter("all")
    }

    const renderWithDeleteSkeleton = (
        skeleton: ReactNode,
        render: (row: Row<DataGridFeatures, ITransaction>) => ReactNode
    ) => {
        return ({row}: { row: Row<DataGridFeatures, ITransaction> }) =>
            deletingIds.has(row.original.id) ? skeleton : render(row)
    }

    const columns = useMemo<ColumnDef<DataGridFeatures, ITransaction>[]>(
        () => [
            {
                accessorKey: "id",
                id: "id",
                header: () => <DataGridTableRowSelectAll/>,
                cell: renderWithDeleteSkeleton(
                    <Skeleton className="h-4.5 w-4.5"/>,
                    (row) => <DataGridTableRowSelect row={row}/>
                ),
                enableSorting: false,
                size: 35,
                meta: {skeleton: <Skeleton className="h-4.5 w-4.5"/>},
                enableResizing: false,
            },
            {
                accessorKey: "title",
                id: "title",
                header: ({column}) => (
                    <DataGridColumnHeader title="Merchant" visibility={true} column={column}/>
                ),
                cell: renderWithDeleteSkeleton(
                    <Skeleton className="h-7 w-auto"/>,
                    (row) => (
                        <div className="flex items-center gap-3">
                            <Avatar className="size-8">
                                <AvatarFallback>{initials(row.original.title)}</AvatarFallback>
                            </Avatar>
                            <div className="space-y-px">
                                <div className="text-foreground font-medium">{row.original.title}</div>
                                <Badge size="sm" variant="secondary">
                                    {row.original.subtitle}
                                </Badge>
                            </div>
                        </div>
                    )
                ),
                size: 260,
                meta: {autoSize: true, skeleton: <Skeleton className="h-7 w-auto"/>},
                enableSorting: true,
                enableHiding: false,
                enableResizing: true,
            },
            {
                id: "transactionId",
                header: ({column}) => (
                    <DataGridColumnHeader title="Transaction ID" visibility={true} column={column}/>
                ),
                cell: renderWithDeleteSkeleton(
                    <Skeleton className="h-7 w-auto"/>,
                    (row) => (
                        <div className="text-muted-foreground font-mono text-xs">
                            {transactionIdLabel(row.original)}
                        </div>
                    )
                ),
                size: 160,
                meta: {skeleton: <Skeleton className="h-7 w-auto"/>},
                enableSorting: false,
                enableHiding: true,
                enableResizing: true,
            },
            {
                accessorKey: "amount",
                id: "amount",
                header: ({column}) => (
                    <DataGridColumnHeader title="Amount" visibility={true} column={column}/>
                ),
                cell: renderWithDeleteSkeleton(
                    <Skeleton className="h-7 w-auto"/>,
                    (row) => (
                        <div
                            className={`text-right font-medium ${
                                row.original.isIncome ? "text-emerald-600" : "text-red-600"
                            }`}
                        >
                            {row.original.isIncome ? "+" : "-"}
                            {formatCurrency(row.original.amount)}
                        </div>
                    )
                ),
                size: 140,
                meta: {skeleton: <Skeleton className="h-7 w-auto"/>},
                enableSorting: true,
                enableHiding: true,
                enableResizing: true,
            },
            {
                accessorKey: "date",
                id: "date",
                header: ({column}) => (
                    <DataGridColumnHeader title="Date" visibility={true} column={column}/>
                ),
                cell: renderWithDeleteSkeleton(
                    <Skeleton className="h-7 w-auto"/>,
                    (row) => <div className="text-foreground font-medium">{formatDate(row.original.date)}</div>
                ),
                size: 140,
                meta: {skeleton: <Skeleton className="h-7 w-auto"/>},
                enableSorting: true,
                enableHiding: true,
                enableResizing: true,
            },
            {
                id: "status",
                header: ({column}) => (
                    <DataGridColumnHeader title="Status" visibility={true} column={column}/>
                ),
                cell: renderWithDeleteSkeleton(
                    <Skeleton className="h-7 w-auto"/>,
                    () => <Badge variant="success-outline">Completed</Badge>
                ),
                size: 120,
                meta: {skeleton: <Skeleton className="h-7 w-auto"/>},
                enableSorting: false,
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
                            onEdit={() => toast.info("Editing transactions is coming soon")}
                            onView={(rowData) => setViewingRow(rowData)}
                            onDelete={(rowData) => setDeletingRow(rowData)}
                            disabled={deletingIds.has(row.original.id)}
                        />
                    )
                ),
                size: 60,
                meta: {skeleton: <Skeleton className="h-6 w-6"/>},
                enableSorting: false,
                enableHiding: false,
                enableResizing: false,
            },
        ],
        [deletingIds]
    )

    const [columnOrder, setColumnOrder] = useState<string[]>(columns.map((c) => c.id as string))
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

    const table = useTable({
        features: dataGridFeatures,
        columns,
        data: filteredData,
        pageCount: Math.ceil((filteredData.length || 0) / pagination.pageSize),
        getRowId: (row: ITransaction) => row.id,
        enableRowSelection: true,
        state: {pagination, sorting, columnOrder, rowSelection},
        onRowSelectionChange: setRowSelection,
        onColumnOrderChange: setColumnOrder,
        onPaginationChange: setPagination,
        onSortingChange: setSorting,
    })

    const {exportSelected} = useTableCSVExport(table, exportColumns)

    const deleteTransaction = (tx: ITransaction) => {
        if (tx.kind === "payment") {
            return deletePayment.mutateAsync(tx.raw.id)
        }
        return deleteExpense.mutateAsync(tx.raw.id)
    }

    const invalidateQueries = () => {
        queryClient.invalidateQueries({queryKey: ["payments"]})
        queryClient.invalidateQueries({queryKey: ["expenses"]})
    }

    const handleConfirmDelete = () => {
        if (!deletingRow) return
        const {id, title} = deletingRow
        setDeletingIds((prev) => new Set(prev).add(id))
        const tx = deletingRow
        setDeletingRow(null)

        deleteTransaction(tx).then(
            () => {
                setTimeout(() => {
                    invalidateQueries()
                    setDeletingIds((prev) => {
                        const next = new Set(prev)
                        next.delete(id)
                        return next
                    })
                    toast.success(`Deleted ${title}`)
                }, DELETE_ANIMATION_MS)
            },
            () => {
                setDeletingIds((prev) => {
                    const next = new Set(prev)
                    next.delete(id)
                    return next
                })
                toast.error(`Failed to delete ${title}`)
            }
        )
    }

    const handleBulkDelete = () => {
        const selectedIds = Object.keys(rowSelection)
        if (selectedIds.length === 0) return

        const selectedTx = selectedIds
            .map((id) => data.find((tx) => tx.id === id))
            .filter((tx): tx is ITransaction => Boolean(tx))

        setDeletingIds((prev) => {
            const next = new Set(prev)
            selectedIds.forEach((id) => next.add(id))
            return next
        })
        table.toggleAllRowsSelected(false)

        Promise.all(selectedTx.map((tx) => deleteTransaction(tx)))
            .then(() => {
                invalidateQueries()
                setDeletingIds((prev) => {
                    const next = new Set(prev)
                    selectedIds.forEach((id) => next.delete(id))
                    return next
                })
                toast.success(`Deleted ${selectedIds.length} transaction(s)`)
            })
            .catch(() => {
                invalidateQueries()
                setDeletingIds((prev) => {
                    const next = new Set(prev)
                    selectedIds.forEach((id) => next.delete(id))
                    return next
                })
                toast.error("Some transactions could not be deleted")
            })
    }

    const isLoading = paymentsQuery.isLoading || expensesQuery.isLoading

    return (
        <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-4">
                <Card className="flex-row items-center gap-3 px-4">
                    <div
                        className="flex size-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                        <ArrowDownCircleIcon className="size-5"/>
                    </div>
                    <div>
                        <div className="text-muted-foreground text-xs">Total In</div>
                        <div className="text-foreground text-lg font-bold">{formatCurrency(stats.totalIn)}</div>
                    </div>
                </Card>
                <Card className="flex-row items-center gap-3 px-4">
                    <div className="flex size-10 items-center justify-center rounded-full bg-red-100 text-red-600">
                        <ArrowUpCircleIcon className="size-5"/>
                    </div>
                    <div>
                        <div className="text-muted-foreground text-xs">Total Out</div>
                        <div className="text-foreground text-lg font-bold">{formatCurrency(stats.totalOut)}</div>
                    </div>
                </Card>
                <Card className="flex-row items-center gap-3 px-4">
                    <div className="flex size-10 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                        <TrendingUpIcon className="size-5"/>
                    </div>
                    <div>
                        <div className="text-muted-foreground text-xs">Largest</div>
                        <div className="text-foreground text-lg font-bold">{formatCurrency(stats.largest)}</div>
                    </div>
                </Card>
                <Card className="flex-row items-center gap-3 px-4">
                    <div
                        className="flex size-10 items-center justify-center rounded-full bg-violet-100 text-violet-600">
                        <ListIcon className="size-5"/>
                    </div>
                    <div>
                        <div className="text-muted-foreground text-xs">Count</div>
                        <div className="text-foreground text-lg font-bold">{stats.count}</div>
                    </div>
                </Card>
            </div>

            <DataGrid
                table={table}
                recordCount={filteredData.length || 0}
                tableLayout={{
                    columnsPinnable: true,
                    columnsResizable: true,
                    columnsMovable: true,
                    columnsVisibility: true,
                }}
                isLoading={isLoading}
                emptyMessage={
                    paymentsQuery.isError || expensesQuery.isError ? (
                        <ReusableEmpty
                            media={<ArchiveIcon className="size-12"/>}
                            title="Couldn't load transactions"
                            description={
                                paymentsQuery.error instanceof Error
                                    ? paymentsQuery.error.message
                                    : expensesQuery.error instanceof Error
                                        ? expensesQuery.error.message
                                        : "Something went wrong while loading transactions."
                            }
                            buttonText="Retry"
                            onAction={() => {
                                paymentsQuery.refetch()
                                expensesQuery.refetch()
                            }}
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
                            title="No transactions yet"
                            description="Transactions you record will show up here."
                        />
                    )
                }
            >
                <TableActionBar table={table} onExport={() => exportSelected("transactions")}
                                onDelete={handleBulkDelete}/>
                <Card className="w-full gap-3 py-0 mt-4">
                    <CardHeader className="flex items-center justify-between px-3.5 py-2">
                        <div className="flex flex-wrap items-center gap-2.5">
                            <InputGroup className="w-56">
                                <InputGroupAddon align="inline-start">
                                    <SearchIcon/>
                                </InputGroupAddon>
                                <InputGroupInput
                                    placeholder="Search transactions..."
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

                            <Select value={methodFilter} onValueChange={setMethodFilter}>
                                <SelectTrigger className="w-40">
                                    <SelectValue placeholder="Method"/>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All methods</SelectItem>
                                    {methodOptions.map((method) => (
                                        <SelectItem key={method} value={method}>
                                            {method}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <Select value={accountFilter} onValueChange={setAccountFilter}>
                                <SelectTrigger className="w-40">
                                    <SelectValue placeholder="Account"/>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All accounts</SelectItem>
                                    {accountOptions.map((account) => (
                                        <SelectItem key={account} value={account}>
                                            {account}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
                                {(["all", "income", "expense"] as const).map((option) => (
                                    <Button
                                        key={option}
                                        size="sm"
                                        variant={typeFilter === option ? "outline" : "ghost"}
                                        className="capitalize"
                                        onClick={() => setTypeFilter(option)}
                                    >
                                        {option}
                                    </Button>
                                ))}
                            </div>
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
                        <DataGridPagination sizes={[8, 16, 32, 50, 100, 500]}/>
                    </CardFooter>
                </Card>
            </DataGrid>

            <ReusableSheet
                title="View transaction"
                description="Read-only details for this transaction."
                open={isViewSheetOpen}
                onOpenChange={(open) => {
                    if (!open) setViewingRow(null)
                }}

                children={
                    viewingRow && (
                        <div className="space-y-2 text-sm">
                            <div><span className="text-muted-foreground">Merchant: </span>{viewingRow.title}</div>
                            <div><span className="text-muted-foreground">Type: </span>{viewingRow.subtitle}</div>
                            <div><span
                                className="text-muted-foreground">Transaction ID: </span>{transactionIdLabel(viewingRow)}
                            </div>
                            <div><span className="text-muted-foreground">Amount: </span>{formatCurrency(viewingRow.amount)}
                            </div>
                            <div><span className="text-muted-foreground">Date: </span>{formatDate(viewingRow.date)}</div>
                            <div><span className="text-muted-foreground">Method: </span>{viewingRow.method ?? "—"}</div>
                        </div>
                    )
                }
            />

            <AlertDialog
                open={isDeleteDialogOpen}
                onOpenChange={(open) => {
                    if (!open) setDeletingRow(null)
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete transaction</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete {deletingRow?.title}? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmDelete}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
