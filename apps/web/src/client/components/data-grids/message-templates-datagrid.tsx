"use client"

// See the identical note in commission-payments-datagrid.tsx: each
// DataGridColumnHeader reads sort state through builder calls React
// Compiler can't trace, so this file opts out entirely.
"use no memo"

import {useMemo, useState} from "react"
import {useAuth} from "@clerk/react"
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query"
import {toast} from "sonner"
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
import {type ColumnDef, type PaginationState, type SortingState, useTable} from "@tanstack/react-table"
import {Card} from "@/components/ui/card.tsx"
import {Badge} from "@/components/reui/badge.tsx"
import {Switch} from "@/components/ui/switch.tsx"
import {Button} from "@/components/ui/button.tsx"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx"
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
import {ReusableSheet} from "@/components-reusable/reusable-sheet.tsx"
import {
    MessageTemplateForm,
    type MessageTemplateFormValues
} from "@/components/forms/messaging/message-template-form.tsx"
import {apiClient} from "@/lib/api.ts"
import {CopyIcon, MoreHorizontalIcon, SquarePenIcon, Trash2Icon} from "lucide-react"
import {Skeleton} from "@/components/ui/skeleton.tsx";

type MessageTemplateRow = MessageTemplateFormValues & {
    id: string
    isDefault: boolean
    isActive: boolean
    createdAt: string | null
}

const CATEGORY_LABELS: Record<string, string> = {
    PAYMENT_REMINDER: "Payment reminder",
    OVERDUE_NOTICE: "Overdue notice",
    FULLY_PAID_THANKYOU: "Thank you",
    MARKETING: "Marketing",
    GENERAL: "General",
    CUSTOM: "Custom",
}

const TIMING_LABELS: Record<string, string> = {
    UPCOMING: "Upcoming",
    DUE_TODAY: "Due today",
    PAST_DUE: "Past due",
}

export function MessageTemplatesDataGrid() {
    const {getToken, has} = useAuth()
    const isAdmin = has?.({role: "org:admin"}) ?? false
    const api = apiClient(getToken)
    const queryClient = useQueryClient()

    const [sorting, setSorting] = useState<SortingState>([{id: "createdAt", desc: true}])
    const [pagination, setPagination] = useState<PaginationState>({pageIndex: 0, pageSize: 8})
    const [editingTemplate, setEditingTemplate] = useState<MessageTemplateRow | null>(null)
    const [deletingTemplate, setDeletingTemplate] = useState<MessageTemplateRow | null>(null)

    const templatesQuery = useQuery({
        queryKey: ["message-templates"],
        queryFn: async () => {
            const res = await api.api["message-templates"].$get()
            if (!res.ok) throw new Error(`Failed to load templates (${res.status})`)
            return res.json() as Promise<MessageTemplateRow[]>
        },
    })

    const toggleActiveMutation = useMutation({
        mutationFn: async ({id, isActive}: { id: string; isActive: boolean }) => {
            const res = await api.api["message-templates"][":id"].$patch({param: {id}, json: {isActive}})
            if (!res.ok) throw new Error("Failed to update template")
            return res.json()
        },
        onSuccess: () => queryClient.invalidateQueries({queryKey: ["message-templates"]}),
        onError: () => toast.error("Failed to update template"),
    })

    const duplicateMutation = useMutation({
        mutationFn: async (id: string) => {
            const res = await api.api["message-templates"][":id"].duplicate.$post({param: {id}, json: {}})
            if (!res.ok) throw new Error("Failed to duplicate template")
            return res.json()
        },
        onSuccess: () => {
            queryClient.invalidateQueries({queryKey: ["message-templates"]})
            toast.success("Template duplicated — customize the copy")
        },
        onError: () => toast.error("Failed to duplicate template"),
    })

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const res = await api.api["message-templates"][":id"].$delete({param: {id}})
            if (!res.ok) throw new Error("Failed to delete template")
            return res.json()
        },
        onSuccess: () => {
            queryClient.invalidateQueries({queryKey: ["message-templates"]})
            toast.success("Template deleted")
            setDeletingTemplate(null)
        },
        onError: () => toast.error("Failed to delete template"),
    })

    const rows = templatesQuery.data ?? []

    const columns = useMemo<ColumnDef<DataGridFeatures, MessageTemplateRow>[]>(
        () => [
            {
                accessorKey: "name",
                id: "name",
                header: ({column}) => <DataGridColumnHeader title="Name" visibility column={column}/>,
                cell: (info) => (
                    <div className="flex items-center gap-2">
                        <span className="font-medium">{info.getValue() as string}</span>
                        {info.row.original.isDefault && <Badge variant="secondary">Default</Badge>}
                    </div>
                ),
                meta: {skeleton: <Skeleton className="h-7 w-auto"/>},
                enableSorting: true,
                size: 260,
            },
            {
                accessorKey: "category",
                id: "category",
                header: ({column}) => <DataGridColumnHeader title="Category" visibility column={column}/>,
                cell: (info) => CATEGORY_LABELS[info.getValue() as string] ?? (info.getValue() as string),
                meta: {skeleton: <Skeleton className="h-7 w-auto"/>},
                enableSorting: true,
                size: 170,
            },
            {
                accessorKey: "reminderTiming",
                id: "reminderTiming",
                header: ({column}) => <DataGridColumnHeader title="Timing" visibility column={column}/>,
                cell: (info) => {
                    const value = info.getValue() as string | null
                    return value ? TIMING_LABELS[value] ?? value : <span className="text-muted-foreground">—</span>
                },
                meta: {skeleton: <Skeleton className="h-7 w-auto"/>},
                enableSorting: false,
                size: 130,
            },
            {
                accessorKey: "channel",
                id: "channel",
                header: ({column}) => <DataGridColumnHeader title="Channel" visibility column={column}/>,
                cell: (info) => info.getValue() as string,
                meta: {skeleton: <Skeleton className="h-7 w-auto"/>},
                enableSorting: false,
                size: 110,
            },
            {
                accessorKey: "isActive",
                id: "isActive",
                header: ({column}) => <DataGridColumnHeader title="Active" visibility column={column}/>,
                cell: (info) => (
                    <Switch
                        checked={info.row.original.isActive}
                        disabled={!isAdmin || toggleActiveMutation.isPending}
                        onCheckedChange={(checked) =>
                            toggleActiveMutation.mutate({id: info.row.original.id, isActive: checked})
                        }
                    />
                ),
                meta: {skeleton: <Skeleton className="h-7 w-auto"/>},
                enableSorting: false,
                size: 90,
            },
            {
                id: "actions",
                header: "",
                cell: (info) => {
                    const row = info.row.original
                    if (!isAdmin) return null
                    return (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="size-8">
                                    <MoreHorizontalIcon className="size-4"/>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                {!row.isDefault && (
                                    <DropdownMenuItem onSelect={() => setEditingTemplate(row)}>
                                        <SquarePenIcon className="size-4"/> Edit
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onSelect={() => duplicateMutation.mutate(row.id)}>
                                    <CopyIcon className="size-4"/> Duplicate
                                </DropdownMenuItem>
                                {!row.isDefault && (
                                    <>
                                        <DropdownMenuSeparator/>
                                        <DropdownMenuItem
                                            variant="destructive"
                                            onSelect={() => setDeletingTemplate(row)}
                                        >
                                            <Trash2Icon className="size-4"/> Delete
                                        </DropdownMenuItem>
                                    </>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )
                },
                meta: {skeleton: <Skeleton className="h-7 w-auto"/>},
                enableSorting: false,
                size: 60,
            },
        ],
        [isAdmin, toggleActiveMutation, duplicateMutation],
    )

    const table = useTable({
        features: dataGridFeatures,
        data: rows,
        columns,
        pageCount: Math.max(1, Math.ceil(rows.length / pagination.pageSize)),
        state: {sorting, pagination},
        onSortingChange: setSorting,
        onPaginationChange: setPagination,
        getRowId: (row: MessageTemplateRow) => row.id,
    })

    return (
        <>
            <DataGrid
                table={table}
                recordCount={rows.length}
                tableLayout={{columnsVisibility: true, columnsPinnable: true}}
                isLoading={templatesQuery.isLoading}
                emptyMessage="No message templates yet."
            >
                <div className="w-full space-y-2.5">
                    <Card className="p-0">
                        <DataGridContainer>
                            <DataGridScrollArea>
                                <DataGridTable/>
                            </DataGridScrollArea>
                        </DataGridContainer>
                    </Card>
                    <DataGridPagination/>
                </div>
            </DataGrid>

            <ReusableSheet
                open={!!editingTemplate}
                onOpenChange={(open) => !open && setEditingTemplate(null)}
                title="Edit template"
                widthClassName="sm:max-w-xl"
            >
                {editingTemplate && <MessageTemplateForm mode="edit" template={editingTemplate}/>}
            </ReusableSheet>

            <AlertDialog open={!!deletingTemplate} onOpenChange={(open) => !open && setDeletingTemplate(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete "{deletingTemplate?.name}"?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This template will no longer be usable in the messaging flow. This can't be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => deletingTemplate && deleteMutation.mutate(deletingTemplate.id)}
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
