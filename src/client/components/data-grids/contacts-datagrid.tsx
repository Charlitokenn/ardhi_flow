import { type ReactNode, useMemo, useState } from "react"
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

interface IContact {
  id: string
  fullName: string
  mobileNumber: string | null
  email: string | null
  contactType: string | null
  region: string | null
  district: string | null
  createdAt: string | null
}

const exportColumns: ExportColumn<IContact>[] = [
  { header: "ID", accessor: (d) => d.id },
  { header: "Full Name", accessor: (d) => d.fullName },
  { header: "Mobile", accessor: (d) => d.mobileNumber },
  { header: "Email", accessor: (d) => d.email },
  { header: "Type", accessor: (d) => d.contactType },
  { header: "Region", accessor: (d) => d.region },
  { header: "District", accessor: (d) => d.district },
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

function contactTypeBadge(type: string | null) {
  switch (type) {
    case "CLIENT":
      return <Badge variant="success-outline">Client</Badge>
    case "LAND_SELLER":
      return <Badge variant="warning-outline">Land Seller</Badge>
    case "SALES_AGENT":
      return <Badge variant="info-outline">Sales Agent</Badge>
    case "AUDITOR":
      return <Badge variant="info-outline">Auditor</Badge>
    case "SURVEYOR":
      return <Badge variant="info-outline">Surveyor</Badge>
    case "ICT_SUPPORT":
      return <Badge variant="info-outline">ICT Support</Badge>
    default:
      return <Badge variant="secondary">{type ?? "—"}</Badge>
  }
}

function ActionsCell({
  row,
  onEdit,
  onView,
  onDelete,
  disabled,
}: {
  row: Row<DataGridFeatures, IContact>
  onEdit: (data: IContact) => void
  onView: (data: IContact) => void
  onDelete: (data: IContact) => void
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

export function ContactsDataGrid() {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  const api = apiClient(getToken)

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 7,
  })
  const [sorting, setSorting] = useState<SortingState>([{ id: "fullName", desc: false }])
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])

  const [viewingRow, setViewingRow] = useState<IContact | null>(null)
  const isViewSheetOpen = viewingRow !== null

  const [deletingRow, setDeletingRow] = useState<IContact | null>(null)
  const isDeleteDialogOpen = deletingRow !== null
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())

  const contactsQuery = useQuery({
    queryKey: ["contacts"],
    queryFn: async () => {
      const res = await api.api.contacts.$get()
      if (!res.ok) throw new Error("Failed to load contacts")
      return res.json()
    },
  })

  const deleteContact = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.api.contacts[":id"].$delete({ param: { id } })
      if (!res.ok) throw new Error("Failed to delete contact")
      return res.json()
    },
  })

  const data = useMemo<IContact[]>(() => contactsQuery.data ?? [], [contactsQuery.data])

  const filteredData = useMemo(() => {
    return data.filter((item) => {
      const matchesType =
        !selectedTypes.length || (item.contactType && selectedTypes.includes(item.contactType))

      const searchLower = searchQuery.toLowerCase()
      const matchesSearch =
        !searchQuery ||
        [item.fullName, item.email, item.mobileNumber, item.region, item.district]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(searchLower)

      return matchesType && matchesSearch
    })
  }, [data, searchQuery, selectedTypes])

  const typeCounts = useMemo(() => {
    return data.reduce(
      (acc, item) => {
        const key = item.contactType ?? "UNKNOWN"
        acc[key] = (acc[key] || 0) + 1
        return acc
      },
      {} as Record<string, number>
    )
  }, [data])

  const handleTypeChange = (checked: boolean, value: string) => {
    setSelectedTypes((prev = []) => (checked ? [...prev, value] : prev.filter((v) => v !== value)))
  }

  const hasActiveFilters = searchQuery.length > 0 || selectedTypes.length > 0

  const handleClearFilters = () => {
    setSearchQuery("")
    setSelectedTypes([])
  }

  const renderWithDeleteSkeleton = (
    skeleton: ReactNode,
    render: (row: Row<DataGridFeatures, IContact>) => ReactNode
  ) => {
    return ({ row }: { row: Row<DataGridFeatures, IContact> }) =>
      deletingIds.has(row.original.id) ? skeleton : render(row)
  }

  const columns = useMemo<ColumnDef<DataGridFeatures, IContact>[]>(
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
        accessorKey: "fullName",
        id: "fullName",
        header: ({ column }) => (
          <DataGridColumnHeader title="Contact" visibility={true} column={column} />
        ),
        cell: renderWithDeleteSkeleton(
          <Skeleton className="h-7 w-auto" />,
          (row) => (
            <div className="flex items-center gap-3">
              <Avatar className="size-8">
                <AvatarFallback>{initials(row.original.fullName)}</AvatarFallback>
              </Avatar>
              <div className="space-y-px">
                <div className="text-foreground font-medium">{row.original.fullName}</div>
                <div className="text-muted-foreground">{row.original.email ?? "—"}</div>
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
        accessorKey: "mobileNumber",
        id: "mobileNumber",
        header: ({ column }) => (
          <DataGridColumnHeader title="Mobile" visibility={true} column={column} />
        ),
        cell: renderWithDeleteSkeleton(
          <Skeleton className="h-7 w-auto" />,
          (row) => <div className="text-foreground font-medium">{row.original.mobileNumber ?? "—"}</div>
        ),
        size: 150,
        meta: { skeleton: <Skeleton className="h-7 w-auto" /> },
        enableSorting: true,
        enableHiding: true,
        enableResizing: true,
      },
      {
        accessorKey: "region",
        id: "region",
        header: ({ column }) => (
          <DataGridColumnHeader title="Location" visibility={true} column={column} />
        ),
        cell: renderWithDeleteSkeleton(
          <Skeleton className="h-7 w-auto" />,
          (row) => (
            <div className="text-foreground font-medium">
              {[row.original.district, row.original.region].filter(Boolean).join(", ") || "—"}
            </div>
          )
        ),
        size: 180,
        meta: { skeleton: <Skeleton className="h-7 w-auto" /> },
        enableSorting: true,
        enableHiding: true,
        enableResizing: true,
      },
      {
        accessorKey: "contactType",
        id: "contactType",
        header: ({ column }) => (
          <DataGridColumnHeader title="Type" visibility={true} column={column} />
        ),
        cell: renderWithDeleteSkeleton(
          <Skeleton className="h-7 w-auto" />,
          (row) => contactTypeBadge(row.original.contactType)
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
              onEdit={() => toast.info("Editing contacts is coming soon")}
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
    getRowId: (row: IContact) => row.id,
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
    const { id, fullName } = deletingRow
    setDeletingIds((prev) => new Set(prev).add(id))
    setDeletingRow(null)

    deleteContact.mutate(id, {
      onSuccess: () => {
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ["contacts"] })
          setDeletingIds((prev) => {
            const next = new Set(prev)
            next.delete(id)
            return next
          })
          toast.success(`Deleted ${fullName}`)
        }, DELETE_ANIMATION_MS)
      },
      onError: () => {
        setDeletingIds((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
        toast.error(`Failed to delete ${fullName}`)
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

    Promise.all(selectedIds.map((id) => deleteContact.mutateAsync(id))).then(() => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] })
      setDeletingIds((prev) => {
        const next = new Set(prev)
        selectedIds.forEach((id) => next.delete(id))
        return next
      })
      toast.success(`Deleted ${selectedIds.length} contact(s)`)
    }).catch(() => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] })
      setDeletingIds((prev) => {
        const next = new Set(prev)
        selectedIds.forEach((id) => next.delete(id))
        return next
      })
      toast.error("Some contacts could not be deleted")
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
        isLoading={contactsQuery.isLoading}
        emptyMessage={
          hasActiveFilters ? (
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
              title="No contacts yet"
              description="Contacts you add will show up here."
            />
          )
        }
      >
        <TableActionBar table={table} onExport={() => exportSelected("contacts")} onDelete={handleBulkDelete} />
        <Card className="w-full gap-3 py-0 mt-4">
          <CardHeader className="flex items-center justify-between px-3.5 py-2">
            <div className="flex items-center gap-2.5">
              <InputGroup className="w-48">
                <InputGroupAddon align="inline-start">
                  <SearchIcon />
                </InputGroupAddon>
                <InputGroupInput
                  placeholder="Search contacts..."
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
                    Type
                    {selectedTypes.length > 0 && (
                      <Badge size="sm" variant="info-outline">
                        {selectedTypes.length}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-48" align="start">
                  <div className="space-y-3">
                    <div className="text-muted-foreground text-xs font-medium">Filters</div>
                    <div className="space-y-3">
                      {Object.keys(typeCounts).map((type) => (
                        <div key={type} className="flex items-center gap-2.5">
                          <Checkbox
                            id={type}
                            checked={selectedTypes.includes(type)}
                            onCheckedChange={(checked) => handleTypeChange(checked === true, type)}
                          />
                          <Label htmlFor={type} className="flex grow items-center justify-between gap-1.5 font-normal">
                            {type}
                            <span className="text-muted-foreground">{typeCounts[type]}</span>
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
          <CardContent className="p-0">
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
        title="View contact"
        description="Read-only details for this contact."
        open={isViewSheetOpen}
        onOpenChange={(open) => {
          if (!open) setViewingRow(null)
        }}
        hideFooter
        formContent={
          viewingRow && (
            <div className="space-y-2 text-sm">
              <div><span className="text-muted-foreground">Name: </span>{viewingRow.fullName}</div>
              <div><span className="text-muted-foreground">Email: </span>{viewingRow.email ?? "—"}</div>
              <div><span className="text-muted-foreground">Mobile: </span>{viewingRow.mobileNumber ?? "—"}</div>
              <div><span className="text-muted-foreground">Type: </span>{viewingRow.contactType ?? "—"}</div>
              <div><span className="text-muted-foreground">Region: </span>{viewingRow.region ?? "—"}</div>
              <div><span className="text-muted-foreground">District: </span>{viewingRow.district ?? "—"}</div>
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
            <AlertDialogTitle>Delete contact</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {deletingRow?.fullName}? This action cannot be undone.
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
