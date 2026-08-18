import {type ReactNode, useEffect, useMemo, useState} from "react"
import {useAuth, useOrganization} from "@clerk/react"
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
import {Avatar, AvatarFallback, AvatarImage,} from "@/components/ui/avatar.tsx"
import {Button} from "@/components/ui/button.tsx"
import {Card, CardAction, CardContent, CardFooter, CardHeader,} from "@/components/ui/card.tsx"
import {Checkbox} from "@/components/ui/checkbox.tsx"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx"
import {InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput,} from "@/components/ui/input-group.tsx"
import {Label} from "@/components/ui/label.tsx"
import {Popover, PopoverContent, PopoverTrigger,} from "@/components/ui/popover.tsx"
import {
    EyeDashedIcon,
    FunnelIcon,
    MoreHorizontalIcon,
    SearchIcon,
    SquarePenIcon,
    Trash2Icon,
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
import {ReusableEmpty,} from "@/components-reusable/reusable-empty.tsx"
import {UsersIcon} from "@/assets/icons"
import {AddEditContactForm, type ContactRecord} from "@/components/forms/contacts/add-edit-contact-form.tsx"
import {formatMobileNumber} from "@/lib/utils.ts";
import {UserDeleteIcon} from "@/assets/icons/index.tsx"
import {ViewContactForm} from "@/components/forms/contacts/view-contact-form.tsx"
import type {ClientContact} from "@/types/contacts.ts"
import {type DocumentBrandingExtra, EMPTY_BRANDING_EXTRA} from "@/types/branding.ts"
// Extends `ContactRecord` with the extra fields the grid itself needs
// (`clientPhoto`, `createdAt`). The list endpoint already returns the full
// contact row, so a grid row carries everything the add/edit form needs —
// no extra fetch or seeding required when opening it for editing.
interface IContact extends ContactRecord {
    clientPhoto: string | null
    createdAt: string | null
}

const exportColumns: ExportColumn<IContact>[] = [
    {header: "ID", accessor: (d) => d.id},
    {header: "Full Name", accessor: (d) => d.fullName},
    {header: "Mobile", accessor: (d) => d.mobileNumber},
    {header: "Email", accessor: (d) => d.email},
    {header: "Type", accessor: (d) => d.contactType},
    {header: "Region", accessor: (d) => d.region},
    {header: "District", accessor: (d) => d.district},
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

// Owns loading the view sheet's data: the contact's full plot/contract
// detail (0002) and the company branding (0001), plus reading the
// organization's name/logo straight from Clerk, combined into the single
// `extra` shape every generated document expects (see the umbrella spec's
// "Cross child contract"). ViewContactForm never fetches on its own.
function ViewSheetContent({viewingRowId}: { viewingRowId: string }) {
    const {getToken} = useAuth()
    const {organization} = useOrganization()
    const api = apiClient(getToken)

    const contactQuery = useQuery({
        queryKey: ["contact-statement-data", viewingRowId],
        queryFn: async () => {
            const res = await api.api.contacts[":id"]["statement-data"].$get({param: {id: viewingRowId}})
            if (!res.ok) throw new Error(`Failed to load contact details (${res.status})`)
            return res.json() as Promise<ClientContact>
        },
    })

    // Branding degrades to the all-null shape rather than blocking the view
    // sheet if it fails to load — only the contact's own detail data blocks.
    const brandingQuery = useQuery({
        queryKey: ["company-settings"],
        queryFn: async () => {
            const res = await api.api["company-settings"].$get()
            if (!res.ok) throw new Error(`Failed to load company settings (${res.status})`)
            return res.json()
        },
        retry: false,
    })

    if (contactQuery.isError) {
        return (
            <div className="mt-8 ml-2 flex flex-col items-start gap-3">
                <p className="text-sm text-destructive">
                    {contactQuery.error instanceof Error ? contactQuery.error.message : "Failed to load contact details"}
                </p>
                <Button variant="outline" size="sm" onClick={() => contactQuery.refetch()}>
                    Retry
                </Button>
            </div>
        )
    }

    if (contactQuery.isLoading || !contactQuery.data) {
        return (
            <div className="mt-8 ml-2 space-y-3">
                <Skeleton className="h-8 w-48"/>
                <Skeleton className="h-64 w-full"/>
            </div>
        )
    }

    const extra: DocumentBrandingExtra = brandingQuery.data
        ? {
            logoUrl: organization?.imageUrl ?? null,
            companyName: organization?.name ?? "",
            branding: {
                slogan: brandingQuery.data.slogan,
                primaryColor: brandingQuery.data.primaryColor,
                email: brandingQuery.data.email,
                mobileNumber: brandingQuery.data.mobileNumber,
                address: brandingQuery.data.address,
                website: brandingQuery.data.website,
                signerTitle: brandingQuery.data.signerTitle,
            },
        }
        : {...EMPTY_BRANDING_EXTRA, logoUrl: organization?.imageUrl ?? null, companyName: organization?.name ?? ""}

    return <ViewContactForm contact={contactQuery.data} extra={extra}/>
}

export function ContactsDataGrid() {
    const {getToken} = useAuth()
    const queryClient = useQueryClient()
    const api = apiClient(getToken)

    const [pagination, setPagination] = useState<PaginationState>({
        pageIndex: 0,
        pageSize: 8,
    })
    const [sorting, setSorting] = useState<SortingState>([{id: "fullName", desc: false}])
    const [searchQuery, setSearchQuery] = useState("")
    const [selectedTypes, setSelectedTypes] = useState<string[]>([])

    const [viewingRow, setViewingRow] = useState<IContact | null>(null)
    const isViewSheetOpen = viewingRow !== null

    const [editingRow, setEditingRow] = useState<IContact | null>(null)
    const isEditSheetOpen = editingRow !== null

    const [deletingRow, setDeletingRow] = useState<IContact | null>(null)
    const isDeleteDialogOpen = deletingRow !== null
    const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())

    const contactsQuery = useQuery({
        queryKey: ["contacts"],
        queryFn: async () => {
            const res = await api.api.contacts.$get()
            if (!res.ok) {
                const body = await res.json().catch(() => null)
                const message = (body && typeof body === "object" && "error" in body ? (body as {
                        error?: string
                    }).error : null)
                    ?? `Failed to load contacts (${res.status})`
                throw new Error(message)
            }
            return res.json()
        },
    })

    useEffect(() => {
        if (contactsQuery.isError) {
            toast.error(contactsQuery.error instanceof Error ? contactsQuery.error.message : "Failed to load contacts")
        }
    }, [contactsQuery.isError, contactsQuery.error])

    const deleteContact = useMutation({
        mutationFn: async (id: string) => {
            const res = await api.api.contacts[":id"].$delete({param: {id}})
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
        return ({row}: { row: Row<DataGridFeatures, IContact> }) =>
            deletingIds.has(row.original.id) ? skeleton : render(row)
    }

    const columns = useMemo<ColumnDef<DataGridFeatures, IContact>[]>(
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
                accessorKey: "fullName",
                id: "fullName",
                header: ({column}) => (
                    <DataGridColumnHeader title="Contact" visibility={true} column={column}/>
                ),
                cell: renderWithDeleteSkeleton(
                    <div className="flex items-center gap-3">
                        <Skeleton className="h-8 w-8 rounded-full"/>
                        <div className="flex flex-col gap-1">
                            <Skeleton className="h-6 w-48"/>
                            <Skeleton className="h-4 w-18 rounded-sm"/>
                        </div>
                    </div>,
                    (row) => (
                        <div className="flex items-center gap-3">
                            <Avatar className="size-8">
                                <AvatarImage
                                    src={row.original.clientPhoto ?? undefined}
                                    className="object-cover"
                                />
                                <AvatarFallback>{initials(row.original.fullName)}</AvatarFallback>
                            </Avatar>
                            <div className="space-y-px">
                                <div className="text-foreground font-medium">{row.original.fullName}</div>
                                <div
                                    className="text-muted-foreground">{contactTypeBadge(row.original.contactType)}</div>
                            </div>
                        </div>
                    )
                ),
                size: 260,
                meta: {
                    autoSize: true,
                    skeleton:
                        <div className="flex items-center gap-3">
                            <Skeleton className="h-8 w-8 rounded-full"/>
                            <div className="flex flex-col gap-1">
                                <Skeleton className="h-6 w-48"/>
                                <Skeleton className="h-4 w-18 rounded-sm"/>
                            </div>
                        </div>
                },
                enableSorting: true,
                enableHiding: false,
                enableResizing: true,
            },
            {
                accessorKey: "mobileNumber",
                id: "mobileNumber",
                header: ({column}) => (
                    <DataGridColumnHeader title="Mobile" visibility={true} column={column}/>
                ),
                cell: renderWithDeleteSkeleton(
                    <Skeleton className="h-7 w-auto"/>,
                    (row) => <div
                        className="text-foreground font-medium">{formatMobileNumber(row.original.mobileNumber) ?? "—"}</div>
                ),
                size: 150,
                meta: {skeleton: <Skeleton className="h-7 w-auto"/>},
                enableSorting: true,
                enableHiding: true,
                enableResizing: true,
            },
            {
                accessorKey: "altMobileNumber",
                id: "altMobileNumber",
                header: ({column}) => (
                    <DataGridColumnHeader title="Alt Mobile" visibility={true} column={column}/>
                ),
                cell: renderWithDeleteSkeleton(
                    <Skeleton className="h-7 w-auto"/>,
                    (row) => <div
                        className="text-foreground font-medium">{formatMobileNumber(row.original.altMobileNumber) ?? ""}</div>
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
                    )
                ),
                size: 60,
                meta: {autoSize: false, skeleton: <Skeleton className="h-6 w-6"/>},
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
        state: {pagination, sorting, columnOrder, rowSelection},
        onRowSelectionChange: setRowSelection,
        onColumnOrderChange: setColumnOrder,
        onPaginationChange: setPagination,
        onSortingChange: setSorting,
    })

    const {exportSelected} = useTableCSVExport(table, exportColumns)

    const handleConfirmDelete = () => {
        if (!deletingRow) return
        const {id, fullName} = deletingRow
        setDeletingIds((prev) => new Set(prev).add(id))
        setDeletingRow(null)

        deleteContact.mutate(id, {
            onSuccess: () => {
                setTimeout(() => {
                    queryClient.invalidateQueries({queryKey: ["contacts"]})
                    setDeletingIds((prev) => {
                        const next = new Set(prev)
                        next.delete(id)
                        return next
                    })
                    toast('Delete Successful', {
                        description: `${fullName} has been deleted`,
                        duration: 5000,
                        icon: <UserDeleteIcon className="size-6"/>,
                    });
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
            queryClient.invalidateQueries({queryKey: ["contacts"]})
            setDeletingIds((prev) => {
                const next = new Set(prev)
                selectedIds.forEach((id) => next.delete(id))
                return next
            })
            toast.success(`Deleted ${selectedIds.length} contact(s)`)
        }).catch(() => {
            queryClient.invalidateQueries({queryKey: ["contacts"]})
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
                    contactsQuery.isError ? (
                        <ReusableEmpty
                            media={<UsersIcon className="size-12"/>}
                            title="Couldn't load contacts"
                            description={contactsQuery.error instanceof Error ? contactsQuery.error.message : "Something went wrong while loading contacts."}
                            buttonText="Retry"
                            onAction={() => contactsQuery.refetch()}
                        />
                    ) : hasActiveFilters ? (
                        <ReusableEmpty
                            media={<UsersIcon className="size-12"/>}
                            title="No matching results"
                            description="Try adjusting your search or filters."
                            buttonText="Clear filters"
                            onAction={handleClearFilters}
                        />
                    ) : (
                        <ReusableEmpty
                            media={<UsersIcon className="size-12"/>}
                            title="No contacts yet"
                            description="Contacts you add will show up here."
                        />
                    )
                }
            >
                <TableActionBar table={table} onExport={() => exportSelected("contacts")} onDelete={handleBulkDelete}/>
                <Card className="w-full gap-3 py-0 mt-4">
                    <CardHeader className="flex items-center justify-between px-3.5 py-2">
                        <div className="flex items-center gap-2.5">
                            <InputGroup className="w-48">
                                <InputGroupAddon align="inline-start">
                                    <SearchIcon/>
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
                                            <XIcon/>
                                        </InputGroupButton>
                                    </InputGroupAddon>
                                )}
                            </InputGroup>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline">
                                        <FunnelIcon/>
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
                                                    <Label htmlFor={type}
                                                           className="flex grow items-center justify-between gap-1.5 font-normal">
                                                        {type}
                                                        <span
                                                            className="text-muted-foreground">{typeCounts[type]}</span>
                                                    </Label>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>
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
                        <DataGridPagination/>
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
                hideHeader
                hideFooter
                popupClass="w-full sm:min-w-2xl"
                formContent={
                    viewingRow && (
                        <ViewSheetContent viewingRowId={viewingRow.id}/>
                    )
                }
            />

            <ReusableSheet
                title="Edit contact"
                description="Update this contact's details."
                open={isEditSheetOpen}
                onOpenChange={(open) => {
                    if (!open) setEditingRow(null)
                }}
                hideFooter
                popupClass="w-full sm:max-w-2xl"
                formContent={
                    editingRow && (
                        <AddEditContactForm
                            mode="edit"
                            contactId={editingRow.id}
                            initialData={editingRow}
                            onSuccess={() => setEditingRow(null)}
                        />
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
