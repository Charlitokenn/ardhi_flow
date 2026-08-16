import { type ReactNode, useEffect, useMemo, useState } from "react"
import { useAuth } from "@clerk/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/lib/api.ts"
import { Badge } from "@/components/reui/badge.tsx"
import {
  DataGrid,
  DataGridContainer,
  dataGridFeatures,
  type DataGridFeatures,
} from "@/components/reui/data-grid/data-grid.tsx"
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header.tsx"
import { DataGridPagination } from "@/components/reui/data-grid/data-grid-pagination.tsx"
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area.tsx"
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
import { toast } from "sonner"
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card.tsx"
import { Checkbox } from "@/components/ui/checkbox.tsx"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group.tsx"
import { Label } from "@/components/ui/label.tsx"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.tsx"
import {
  MoreHorizontalIcon,
  SearchIcon,
  EyeDashedIcon,
  XIcon,
  FunnelIcon,
  SquarePenIcon,
  Trash2Icon,
} from "lucide-react"
import { useTableCSVExport } from "@/hooks/use-table-csv-export.ts"
import { TableActionBar } from "@/components-reusable/reusable-table-action-bar.tsx"
import { type ExportColumn } from "@/lib/export-csv.ts"
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
import { Skeleton } from "@/components/ui/skeleton.tsx"
import {
  ReusableEmpty,
  SearchCardsIllustration,
} from "@/components-reusable/reusable-empty.tsx"
import { ArchiveIcon } from "@/assets/icons"

interface IContractPlot {
  id: string
  plotNumber: string
  surveyedPlotNumber: string | null
}

interface IContractClient {
  id: string
  fullName: string
  mobileNumber: string | null
}

interface IContract {
  id: string
  status: "ACTIVE" | "DELINQUENT" | "COMPLETED" | "CANCELLED"
  startDate: string
  termMonths: number
  totalContractValue: string
  downpaymentAmount: string
  financedAmount: string
  purchasePlan: "FLAT_RATE" | "DOWNPAYMENT"
  createdAt: string | null
  plot: IContractPlot | null
  client: IContractClient | null
}

const exportColumns: ExportColumn<IContract>[] = [
  { header: "ID", accessor: (d) => d.id },
  { header: "Client", accessor: (d) => d.client?.fullName ?? null },
  { header: "Plot", accessor: (d) => d.plot?.plotNumber ?? null },
  { header: "Value", accessor: (d) => d.totalContractValue },
  { header: "Plan", accessor: (d) => d.purchasePlan },
  { header: "Status", accessor: (d) => d.status },
  { header: "Start Date", accessor: (d) => d.startDate },
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

function formatCurrency(value: string | number | null | undefined) {
  const num = typeof value === "string" ? parseFloat(value) : value
  if (num === null || num === undefined || Number.isNaN(num)) return "—"
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(num)
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
}

function statusBadge(status: string | null) {
  switch (status) {
    case "ACTIVE":
      return <Badge variant="success-outline">Active</Badge>
    case "DELINQUENT":
      return <Badge variant="destructive-outline">Delinquent</Badge>
    case "COMPLETED":
      return <Badge variant="info-outline">Completed</Badge>
    case "CANCELLED":
      return <Badge variant="secondary">Cancelled</Badge>
    default:
      return <Badge variant="secondary">{status ?? "—"}</Badge>
  }
}

function ActionsCell({
  row,
  onEdit,
  onView,
  onDelete,
  disabled,
}: {
  row: Row<DataGridFeatures, IContract>
  onEdit: (data: IContract) => void
  onView: (data: IContract) => void
  onDelete: (data: IContract) => void
  disabled?: boolean
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="size-7" size="icon" variant="ghost" disabled={disabled}>
          <MoreHorizontalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="left" align="start">
        <DropdownMenuItem onClick={() => onEdit(row.original)} className="cursor-pointer">
          <SquarePenIcon /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onView(row.original)} className="cursor-pointer">
          <EyeDashedIcon /> View
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => onDelete(row.original)}
          className="cursor-pointer"
        >
          <Trash2Icon /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const DELETE_ANIMATION_MS = 600

export function ContractsDataGrid() {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  const api = apiClient(getToken)

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 8,
  })
  const [sorting, setSorting] = useState<SortingState>([{ id: "startDate", desc: true }])
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])

  const [viewingRow, setViewingRow] = useState<IContract | null>(null)
  const isViewSheetOpen = viewingRow !== null

  const [deletingRow, setDeletingRow] = useState<IContract | null>(null)
  const isDeleteDialogOpen = deletingRow !== null
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())

  const contractsQuery = useQuery({
    queryKey: ["contracts"],
    queryFn: async () => {
      const res = await api.api.contracts.$get()
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        const message = (body && typeof body === "object" && "error" in body ? (body as { error?: string }).error : null)
          ?? `Failed to load contracts (${res.status})`
        throw new Error(message)
      }
      return res.json()
    },
  })

  useEffect(() => {
    if (contractsQuery.isError) {
      toast.error(contractsQuery.error instanceof Error ? contractsQuery.error.message : "Failed to load contracts")
    }
  }, [contractsQuery.isError, contractsQuery.error])

  const deleteContract = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.api.contracts[":id"].$delete({ param: { id } })
      if (!res.ok) throw new Error("Failed to delete contract")
      return res.json()
    },
  })

  const data = useMemo<IContract[]>(
    () => (contractsQuery.data as unknown as IContract[]) ?? [],
    [contractsQuery.data]
  )

  const filteredData = useMemo(() => {
    return data.filter((item) => {
      const matchesStatus = !selectedStatuses.length || selectedStatuses.includes(item.status)

      const searchLower = searchQuery.toLowerCase()
      const matchesSearch =
        !searchQuery ||
        [item.client?.fullName, item.plot?.plotNumber, item.plot?.surveyedPlotNumber, item.status]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(searchLower)

      return matchesStatus && matchesSearch
    })
  }, [data, searchQuery, selectedStatuses])

  const statusCounts = useMemo(() => {
    return data.reduce(
      (acc, item) => {
        const key = item.status ?? "UNKNOWN"
        acc[key] = (acc[key] || 0) + 1
        return acc
      },
      {} as Record<string, number>
    )
  }, [data])

  const handleStatusChange = (checked: boolean, value: string) => {
    setSelectedStatuses((prev = []) =>
      checked ? [...prev, value] : prev.filter((v) => v !== value)
    )
  }

  const hasActiveFilters = searchQuery.length > 0 || selectedStatuses.length > 0

  const handleClearFilters = () => {
    setSearchQuery("")
    setSelectedStatuses([])
  }

  const renderWithDeleteSkeleton = (
    skeleton: ReactNode,
    render: (row: Row<DataGridFeatures, IContract>) => ReactNode
  ) => {
    return ({ row }: { row: Row<DataGridFeatures, IContract> }) =>
      deletingIds.has(row.original.id) ? skeleton : render(row)
  }

  const columns = useMemo<ColumnDef<DataGridFeatures, IContract>[]>(
    () => [
      {
        accessorKey: "id",
        id: "id",
        header: () => <DataGridTableRowSelectAll />,
        cell: renderWithDeleteSkeleton(
          <Skeleton className="h-4.5 w-4.5" />,
          (row) => <DataGridTableRowSelect row={row} />
        ),
        enableSorting: false,
        size: 35,
        meta: { skeleton: <Skeleton className="h-4.5 w-4.5" /> },
        enableResizing: false,
      },
      {
        accessorKey: "client",
        id: "client",
        header: ({ column }) => (
          <DataGridColumnHeader title="Contract" visibility={true} column={column} />
        ),
        cell: renderWithDeleteSkeleton(
          <Skeleton className="h-7 w-auto" />,
          (row) => (
            <div className="flex items-center gap-3">
              <Avatar className="size-8">
                <AvatarFallback>{initials(row.original.client?.fullName ?? "—")}</AvatarFallback>
              </Avatar>
              <div className="space-y-px">
                <div className="text-foreground font-medium">
                  {row.original.client?.fullName ?? "—"}
                </div>
                <div className="text-muted-foreground">
                  Plot {row.original.plot?.plotNumber ?? "—"}
                </div>
              </div>
            </div>
          )
        ),
        size: 260,
        meta: { autoSize: true, skeleton: <Skeleton className="h-7 w-auto" /> },
        enableSorting: true,
        enableHiding: false,
        enableResizing: true,
      },
      {
        accessorKey: "totalContractValue",
        id: "totalContractValue",
        header: ({ column }) => (
          <DataGridColumnHeader title="Value" visibility={true} column={column} />
        ),
        cell: renderWithDeleteSkeleton(
          <Skeleton className="h-7 w-auto" />,
          (row) => (
            <div className="text-foreground font-medium">
              {formatCurrency(row.original.totalContractValue)}
            </div>
          )
        ),
        size: 150,
        meta: { skeleton: <Skeleton className="h-7 w-auto" /> },
        enableSorting: true,
        enableHiding: true,
        enableResizing: true,
      },
      {
        accessorKey: "purchasePlan",
        id: "purchasePlan",
        header: ({ column }) => (
          <DataGridColumnHeader title="Plan" visibility={true} column={column} />
        ),
        cell: renderWithDeleteSkeleton(
          <Skeleton className="h-7 w-auto" />,
          (row) => (
            <div className="text-foreground font-medium">
              {row.original.purchasePlan === "FLAT_RATE" ? "Flat Rate" : "Downpayment"}
            </div>
          )
        ),
        size: 140,
        meta: { skeleton: <Skeleton className="h-7 w-auto" /> },
        enableSorting: true,
        enableHiding: true,
        enableResizing: true,
      },
      {
        accessorKey: "status",
        id: "status",
        header: ({ column }) => (
          <DataGridColumnHeader title="Status" visibility={true} column={column} />
        ),
        cell: renderWithDeleteSkeleton(
          <Skeleton className="h-7 w-auto" />,
          (row) => statusBadge(row.original.status)
        ),
        size: 130,
        meta: { skeleton: <Skeleton className="h-7 w-auto" /> },
        enableSorting: true,
        enableHiding: true,
        enableResizing: true,
      },
      {
        accessorKey: "startDate",
        id: "startDate",
        header: ({ column }) => (
          <DataGridColumnHeader title="Start Date" visibility={true} column={column} />
        ),
        cell: renderWithDeleteSkeleton(
          <Skeleton className="h-7 w-auto" />,
          (row) => (
            <div className="text-foreground font-medium">
              {formatDate(row.original.startDate)}
            </div>
          )
        ),
        size: 140,
        meta: { skeleton: <Skeleton className="h-7 w-auto" /> },
        enableSorting: true,
        enableHiding: true,
        enableResizing: true,
      },
      {
        id: "actions",
        header: "",
        cell: renderWithDeleteSkeleton(
          <Skeleton className="h-6 w-6" />,
          (row) => (
            <ActionsCell
              row={row}
              onEdit={() => toast.info("Editing contracts is coming soon")}
              onView={(rowData) => setViewingRow(rowData)}
              onDelete={(rowData) => setDeletingRow(rowData)}
              disabled={deletingIds.has(row.original.id)}
            />
          )
        ),
        size: 60,
        meta: { skeleton: <Skeleton className="h-6 w-6" /> },
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
    getRowId: (row: IContract) => row.id,
    enableRowSelection: true,
    state: { pagination, sorting, columnOrder, rowSelection },
    onRowSelectionChange: setRowSelection,
    onColumnOrderChange: setColumnOrder,
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
  })

  const { exportSelected } = useTableCSVExport(table, exportColumns)

  const handleConfirmDelete = () => {
    if (!deletingRow) return
    const { id } = deletingRow
    const label = deletingRow.client?.fullName ?? "contract"
    setDeletingIds((prev) => new Set(prev).add(id))
    setDeletingRow(null)

    deleteContract.mutate(id, {
      onSuccess: () => {
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ["contracts"] })
          setDeletingIds((prev) => {
            const next = new Set(prev)
            next.delete(id)
            return next
          })
          toast.success(`Deleted contract for ${label}`)
        }, DELETE_ANIMATION_MS)
      },
      onError: () => {
        setDeletingIds((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
        toast.error(`Failed to delete contract for ${label}`)
      },
    })
  }

  const handleBulkDelete = () => {
    const selectedIds = Object.keys(rowSelection)
    if (selectedIds.length === 0) return

    setDeletingIds((prev) => {
      const next = new Set(prev)
      selectedIds.forEach((id) => next.add(id))
      return next
    })
    table.toggleAllRowsSelected(false)

    Promise.all(selectedIds.map((id) => deleteContract.mutateAsync(id))).then(() => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] })
      setDeletingIds((prev) => {
        const next = new Set(prev)
        selectedIds.forEach((id) => next.delete(id))
        return next
      })
      toast.success(`Deleted ${selectedIds.length} contract(s)`)
    }).catch(() => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] })
      setDeletingIds((prev) => {
        const next = new Set(prev)
        selectedIds.forEach((id) => next.delete(id))
        return next
      })
      toast.error("Some contracts could not be deleted")
    })
  }

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
        isLoading={contractsQuery.isLoading}
        emptyMessage={
          contractsQuery.isError ? (
            <ReusableEmpty
              media={<ArchiveIcon className="size-12" />}
              title="Couldn't load contracts"
              description={contractsQuery.error instanceof Error ? contractsQuery.error.message : "Something went wrong while loading contracts."}
              buttonText="Retry"
              onAction={() => contractsQuery.refetch()}
            />
          ) : hasActiveFilters ? (
            <ReusableEmpty
              media={<SearchCardsIllustration />}
              title="No matching results"
              description="Try adjusting your search or filters."
              buttonText="Clear filters"
              onAction={handleClearFilters}
            />
          ) : (
            <ReusableEmpty
              media={<ArchiveIcon className="size-12" />}
              title="No contracts yet"
              description="Contracts you create will show up here."
            />
          )
        }
      >
        <TableActionBar table={table} onExport={() => exportSelected("contracts")} onDelete={handleBulkDelete} />
        <Card className="w-full gap-3 py-0 mt-4">
          <CardHeader className="flex items-center justify-between px-3.5 py-2">
            <div className="flex items-center gap-2.5">
              <InputGroup className="w-48">
                <InputGroupAddon align="inline-start">
                  <SearchIcon />
                </InputGroupAddon>
                <InputGroupInput
                  placeholder="Search contracts..."
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
                      <XIcon />
                    </InputGroupButton>
                  </InputGroupAddon>
                )}
              </InputGroup>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline">
                    <FunnelIcon />
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
                    <div className="text-muted-foreground text-xs font-medium">Filters</div>
                    <div className="space-y-3">
                      {Object.keys(statusCounts).map((status) => (
                        <div key={status} className="flex items-center gap-2.5">
                          <Checkbox
                            id={status}
                            checked={selectedStatuses.includes(status)}
                            onCheckedChange={(checked) => handleStatusChange(checked === true, status)}
                          />
                          <Label htmlFor={status} className="flex grow items-center justify-between gap-1.5 font-normal">
                            {status}
                            <span className="text-muted-foreground">{statusCounts[status]}</span>
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <CardAction />
          </CardHeader>
          <CardContent className="p-0.5">
            <Card className="p-0">
              <DataGridContainer>
                <DataGridScrollArea>
                  <DataGridTable />
                </DataGridScrollArea>
              </DataGridContainer>
            </Card>
          </CardContent>
          <CardFooter className="border-none bg-transparent! px-3.5 py-2">
            <DataGridPagination />
          </CardFooter>
        </Card>
      </DataGrid>

      <ReusableSheet
        title="View contract"
        description="Read-only details for this contract."
        open={isViewSheetOpen}
        onOpenChange={(open) => {
          if (!open) setViewingRow(null)
        }}
        hideFooter
        formContent={
          viewingRow && (
            <div className="space-y-2 text-sm">
              <div><span className="text-muted-foreground">Client: </span>{viewingRow.client?.fullName ?? "—"}</div>
              <div><span className="text-muted-foreground">Mobile: </span>{viewingRow.client?.mobileNumber ?? "—"}</div>
              <div><span className="text-muted-foreground">Plot: </span>{viewingRow.plot?.plotNumber ?? "—"}</div>
              <div><span className="text-muted-foreground">Surveyed Plot No: </span>{viewingRow.plot?.surveyedPlotNumber ?? "—"}</div>
              <div><span className="text-muted-foreground">Status: </span>{viewingRow.status}</div>
              <div><span className="text-muted-foreground">Purchase Plan: </span>{viewingRow.purchasePlan}</div>
              <div><span className="text-muted-foreground">Start Date: </span>{formatDate(viewingRow.startDate)}</div>
              <div><span className="text-muted-foreground">Term (months): </span>{viewingRow.termMonths}</div>
              <div><span className="text-muted-foreground">Total Value: </span>{formatCurrency(viewingRow.totalContractValue)}</div>
              <div><span className="text-muted-foreground">Downpayment: </span>{formatCurrency(viewingRow.downpaymentAmount)}</div>
              <div><span className="text-muted-foreground">Financed Amount: </span>{formatCurrency(viewingRow.financedAmount)}</div>
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
            <AlertDialogTitle>Delete contract</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this contract for {deletingRow?.client?.fullName ?? "this client"}? This action cannot be undone.
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
