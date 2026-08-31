import {type FormEvent, type ReactNode, useEffect, useMemo, useState} from "react"
import {useCopyToClipboard, useTableCSVExport} from "../../../../../../packages/api-client/src/index.ts"
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
    ClipboardIcon,
    EyeDashedIcon,
    FunnelIcon,
    MoreHorizontalIcon,
    SearchIcon,
    SquarePenIcon,
    Trash2Icon,
    UserPlusIcon,
    XIcon
} from "lucide-react"
import {TableActionBar} from "@/components-reusable/reusable-table-action-bar.tsx"
import {type DateRange} from "react-day-picker"
import {DateRangePicker} from "@/components/ui/date-range-picker.tsx"
import {matchesDateRange} from "@/lib/table-filters.ts"
import {type ExportColumn} from "@/lib/export-csv.ts"
import ReusableSheet from "@/components-reusable/reusable-sheet.tsx"
import {Input} from "@/components/ui/input.tsx"
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

/**
 * ============================================================================
 * DATAGRID TEMPLATE — HOW TO ADAPT THIS FILE TO A NEW DATASET
 * ============================================================================
 * This file is a self-contained, copy-pasteable pattern for building a data
 * grid with search, status filtering, date-range filtering, row selection,
 * CSV export, and per-row Edit/View/Delete actions on top of
 * `@tanstack/react-table` (via the `reui` DataGrid primitives). It also
 * demonstrates:
 *   - a delete-in-progress skeleton state per row (see `deletingIds` below),
 *     for both single-row and bulk deletion, and
 *   - a togglable client-side / server-side data mode (see the "DATA MODE"
 *     section below), so the same grid can be adapted to either fetch
 *     everything up front and filter in the browser, or delegate filtering
 *     and pagination to an API.
 *
 * To reuse this template for a different dataset:
 * 1. Replace `IData` below with the shape of your actual record.
 * 2. Replace `demoData` with data fetched from your API (e.g. via a query
 *    hook). Keep it as a plain array of `IData`.
 * 3. Update `exportColumns` to describe how each field should be rendered
 *    in the exported CSV.
 * 4. Update the `columns` array (see `useMemo` below) to match the fields
 *    you want to display — each column is independent, so you can add,
 *    remove, or reorder them freely.
 * 5. Update the search/filter logic in `filteredData` if your dataset needs
 *    different filter dimensions (e.g. remove the date-range filter if you
 *    have no date field).
 * 6. Update the `formContent` passed to the edit `ReusableSheet` below to
 *    contain the actual input fields for your record.
 * 7. Replace `fetchServerSide` (used when `dataMode === "server"`) with a
 *    real API call that accepts the same filter/sort/pagination params and
 *    returns `{ rows, totalCount }` for the current page.
 * 8. Customize the `emptyMessage` passed to `DataGrid` below (built with the
 *    reusable `ReusableEmpty` component) — e.g. change its title/description
 *    to describe your dataset, or point its action button at your own
 *    "create" flow instead of `handleClearFilters`.
 * ============================================================================
 */

interface IData {
    id: string
    name: string
    availability: "online" | "away" | "busy" | "offline"
    avatar: string
    status: "Active" | "Inactive" | "Pending" | "Blocked"
    flag: string
    email: string
    company: string
    role: string
    joined: string
    // Bug fix: `joinedDate` is used by every entry in `demoData` and by the
    // `matchesDateRange` filter below, but was missing from this interface.
    joinedDate?: Date | string
    location: string
    balance: number
}

const demoData: IData[] = []

//     [
//   {
//     id: "1",
//     name: "Alex Johnson",
//     availability: "online",
//     avatar:
//       "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=96&h=96&dpr=2&q=80",
//     status: "Active",
//     flag: "us",
//     email: "alex@apple.com",
//     company: "Apple",
//     role: "CEO",
//     joined: "Jan, 2024",
//     joinedDate: new Date(2024, 0, 1),
//     location: "United States",
//     balance: 5143.03,
//   },
//   {
//     id: "2",
//     name: "Sarah Chen",
//     availability: "away",
//     avatar:
//       "https://images.unsplash.com/photo-1519699047748-de8e457a634e?w=96&h=96&dpr=2&q=80",
//     status: "Inactive",
//     flag: "gb",
//     email: "sarah@openai.com",
//     company: "OpenAI",
//     role: "CTO",
//     joined: "Mar, 2023",
//     joinedDate: new Date(2024, 0, 1),
//     location: "United Kingdom",
//     balance: 4321.87,
//   },
//   {
//     id: "3",
//     name: "Michael Rodriguez",
//     availability: "busy",
//     avatar:
//       "https://images.unsplash.com/photo-1584308972272-9e4e7685e80f?w=96&h=96&dpr=2&q=80",
//     status: "Blocked",
//     flag: "ca",
//     email: "michael@meta.com",
//     company: "Meta",
//     role: "Designer",
//     joined: "Jun, 2022",
//     joinedDate: new Date(2024, 0, 1),
//     location: "Canada",
//     balance: 7654.98,
//   },
//   {
//     id: "4",
//     name: "Emma Wilson",
//     availability: "offline",
//     avatar:
//       "https://images.unsplash.com/photo-1485893086445-ed75865251e0?w=96&h=96&dpr=2&q=80",
//     status: "Inactive",
//     flag: "au",
//     email: "emma@tesla.com",
//     company: "Tesla",
//     role: "Developer",
//     joined: "Sep, 2024",
//     joinedDate: new Date(2024, 0, 1),
//     location: "Australia",
//     balance: 3456.45,
//   },
//   {
//     id: "5",
//     name: "David Kim",
//     availability: "online",
//     avatar:
//       "https://images.unsplash.com/photo-1607990281513-2c110a25bd8c?w=96&h=96&dpr=2&q=80",
//     status: "Active",
//     flag: "de",
//     email: "david@sap.com",
//     company: "SAP",
//     role: "Lawyer",
//     joined: "Nov, 2023",
//     joinedDate: new Date(2024, 0, 1),
//     location: "Germany",
//     balance: 9876.54,
//   },
//   {
//     id: "6",
//     name: "Aron Thompson",
//     availability: "away",
//     avatar:
//       "https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=96&h=96&dpr=2&q=80",
//     status: "Pending",
//     flag: "my",
//     email: "aron@keenthemes.com",
//     company: "Keenthemes",
//     role: "Director",
//     joined: "Feb, 2022",
//     joinedDate: new Date(2024, 0, 1),
//     location: "Malaysia",
//     balance: 6214.22,
//   },
//   {
//     id: "7",
//     name: "James Brown",
//     availability: "busy",
//     avatar:
//       "https://images.unsplash.com/photo-1543299750-19d1d6297053?w=96&h=96&dpr=2&q=80",
//     status: "Inactive",
//     flag: "es",
//     email: "james@bbva.es",
//     company: "BBVA",
//     role: "Product Manager",
//     joined: "Aug, 2024",
//     joinedDate: new Date(2024, 0, 1),
//     location: "Spain",
//     balance: 5321.77,
//   },
//   {
//     id: "8",
//     name: "Maria Garcia",
//     availability: "offline",
//     avatar:
//       "https://images.unsplash.com/photo-1620075225255-8c2051b6c015?w=96&h=96&dpr=2&q=80",
//     status: "Blocked",
//     flag: "jp",
//     email: "maria@sony.jp",
//     company: "Sony",
//     role: "Marketing Lead",
//     joined: "Dec, 2023",
//     joinedDate: new Date(2024, 0, 1),
//     location: "Japan",
//     balance: 8452.39,
//   },
//   {
//     id: "9",
//     name: "Nick Johnson",
//     availability: "online",
//     avatar:
//       "https://images.unsplash.com/photo-1485206412256-701ccc5b93ca?w=96&h=96&dpr=2&q=80",
//     status: "Pending",
//     flag: "fr",
//     email: "nick@lvmh.fr",
//     company: "LVMH",
//     role: "Data Scientist",
//     joined: "Apr, 2022",
//     joinedDate: new Date(2024, 0, 1),
//     location: "France",
//     balance: 7345.1,
//   },
//   {
//     id: "10",
//     name: "Liam Thompson",
//     availability: "away",
//     avatar:
//       "https://images.unsplash.com/photo-1542595913-85d69b0edbaf?w=96&h=96&dpr=2&q=80",
//     status: "Inactive",
//     flag: "it",
//     email: "liam@eni.it",
//     company: "ENI",
//     role: "Engineer",
//     joined: "Jul, 2024",
//     joinedDate: "",
//     location: "Italy",
//     balance: 5214.88,
//   },
//   {
//     id: "11",
//     name: "Alex Johnson",
//     availability: "busy",
//     avatar:
//       "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=96&h=96&dpr=2&q=80",
//     status: "Blocked",
//     flag: "br",
//     email: "alex@vale.br",
//     company: "Vale",
//     role: "Software Engineer",
//     joined: "May, 2023",
//     joinedDate: new Date(2026, 0, 6),
//     location: "Brazil",
//     balance: 9421.5,
//   },
//   {
//     id: "12",
//     name: "Sarah Chen",
//     availability: "offline",
//     avatar:
//       "https://images.unsplash.com/photo-1519699047748-de8e457a634e?w=96&h=96&dpr=2&q=80",
//     status: "Active",
//     flag: "in",
//     email: "sarah@tata.in",
//     company: "Tata",
//     role: "Sales Manager",
//     joined: "Oct, 2024",
//     joinedDate: new Date(2026, 0, 12),
//     location: "India",
//     balance: 4521.67,
//   },
// ]

// Minimum time (ms) a row's delete skeleton stays visible before the row is
// actually removed from `data`. Keeps the "this row is being deleted" state
// perceivable even when the (simulated, or a very fast real) delete resolves
// almost instantly. Set to `0` once a slower real API call already provides
// enough of its own latency.
const DELETE_ANIMATION_MS = 2000

// Define columns for export once — completely decoupled from UI columns
// Bug fix: `as const` made this a readonly tuple of literal types, which is
// not assignable to `ExportColumn<IData>[]` expected by `useTableCSVExport`.
// An explicit type annotation is what we actually want here.
const exportColumns: ExportColumn<IData>[] = [
    {header: "ID", accessor: (d: IData) => d.id},
    {header: "Name", accessor: (d: IData) => d.name},
    {header: "Email", accessor: (d: IData) => d.email},
    {header: "Company", accessor: (d: IData) => d.company},
    {header: "Role", accessor: (d: IData) => d.role},
    {header: "Location", accessor: (d: IData) => d.location},
    {header: "Status", accessor: (d: IData) => d.status},
    {header: "Joined", accessor: (d: IData) => d.joined},
    {header: "Balance", accessor: (d: IData) => d.balance.toFixed(2)},
]

/**
 * Per-row "..." actions menu. This is deliberately dumb — it only reports
 * user intent (edit/delete/copy) upwards via callback props. All actual
 * state changes (opening the edit sheet, opening the delete confirmation,
 * mutating data) live in the parent `DataTablePattern` component, which is
 * the single source of truth for the grid's data.
 */
function ActionsCell({
                         row,
                         onEdit,
                         onView,
                         onDelete,
                         disabled,
                     }: {
    row: Row<DataGridFeatures, IData>
    onEdit: (data: IData) => void
    onView: (data: IData) => void
    onDelete: (data: IData) => void
    // Disabled while this row is mid-deletion (see `deletingIds` in the parent)
    // so a user can't queue up another edit/delete on a row that's already
    // being removed.
    disabled?: boolean
}) {
    const {copyToClipboard} = useCopyToClipboard()

    const handleCopyId = () => {
        copyToClipboard(row.original.id)
        toast.success("Employee ID copied", {description: row.original.id})
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button className="size-7" size="icon" variant="ghost" disabled={disabled}>
                    <MoreHorizontalIcon/>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="left" align="start">
                {/* EDIT: notifies the parent which row to edit. The parent stores
              this row in `editingRow` state, which controls the visibility
              of the `ReusableSheet` rendered once at the bottom of
              `DataTablePattern` (see the "Edit sheet" section below). */}
                <DropdownMenuItem onClick={() => onEdit(row.original)} className="cursor-pointer">
                    <SquarePenIcon/> Edit
                </DropdownMenuItem>

                {/* VIEW: notifies the parent which row to view. The parent stores it
              in `viewingRow` state, which drives a second, read-only
              `ReusableSheet` rendered near the bottom of `DataTablePattern`
              (see the "View sheet" section below). That sheet is currently
              an *empty container* — it only proves the row data reaches it —
              so it can be filled in later with the real read-only view for
              this record without touching any of this wiring. */}
                <DropdownMenuItem onClick={() => onView(row.original)} className="cursor-pointer">
                    <EyeDashedIcon/> View
                </DropdownMenuItem>

                <DropdownMenuItem
                    onClick={handleCopyId}
                    className="cursor-pointer"
                >
                    <ClipboardIcon/> Copy ID
                </DropdownMenuItem>

                <DropdownMenuSeparator/>

                {/* DELETE: notifies the parent which row to delete. The parent
              stores this row in `deletingRow` state, which controls the
              visibility of the confirmation `AlertDialog` rendered once at
              the bottom of `DataTablePattern` (see the "Delete confirmation"
              section below). We never delete directly from here — a single
              row action should never mutate data without a confirmation
              step and without going through the parent's data source. */}
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

export function DataTablePattern() {
    const [pagination, setPagination] = useState<PaginationState>({
        pageIndex: 0,
        pageSize: 8,
    })
    const [sorting, setSorting] = useState<SortingState>([
        {id: "name", desc: true},
    ])
    const [searchQuery, setSearchQuery] = useState("")
    const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])

    // Add to your component state
    const [joinedRange, setJoinedRange] = useState<DateRange | undefined>()

    // The actual data source for the grid. In a real app, replace this with
    // data coming from your API (e.g. `useQuery(...).data ?? []`), and swap
    // `setData` below for your update/create/delete mutations. In "server"
    // data mode (see below) this is only used as the mock backing store for
    // `fetchServerSide` — a real server-mode integration wouldn't need this
    // local array at all, since the server already owns the data.
    const [data, setData] = useState<IData[]>(demoData)

    // --- Edit sheet state ---------------------------------------------------
    // `editingRow` holds the row currently being edited, or `null` when the
    // edit sheet should be closed. Using the row itself (instead of a boolean
    // + separate "current row" ref) guarantees the sheet always has the data
    // it needs to render, and avoids a whole class of "open with stale row"
    // bugs. `isEditSheetOpen` is simply derived from it.
    const [editingRow, setEditingRow] = useState<IData | null>(null)
    const isEditSheetOpen = editingRow !== null

    // --- View sheet state ----------------------------------------------------
    // Same pattern again: `viewingRow` is the row currently being viewed, or
    // `null` when the view sheet should be closed. See the "View sheet" render
    // section near the bottom for how this is currently just an *empty
    // container* that proves the row data made it through.
    const [viewingRow, setViewingRow] = useState<IData | null>(null)
    const isViewSheetOpen = viewingRow !== null

    // --- Delete confirmation state ------------------------------------------
    // Same pattern as `editingRow`: the row pending deletion drives the
    // confirmation `AlertDialog`'s open state.
    const [deletingRow, setDeletingRow] = useState<IData | null>(null)
    const isDeleteDialogOpen = deletingRow !== null

    // --- Delete-in-progress skeleton state -----------------------------------
    // Ids currently being removed. While an id is in this set, every column's
    // cell renders its `meta.skeleton` placeholder instead of real content
    // (see the `columns` definition below), giving the user a clear "this row
    // is being deleted" visual instead of the row just vanishing instantly.
    // `DELETE_ANIMATION_MS` is the minimum time the skeleton stays visible —
    // bump it up if deletes resolve so fast the skeleton would otherwise
    // flash imperceptibly; drop it to 0 once a real API call already provides
    // enough latency on its own.
    const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())

    // Setting loading states
    const [isLoading, setIsLoading] = useState(false)

    const handleToggleLoading = () => {
        setIsLoading((prev) => !prev)
    }

    // --- DATA MODE: client vs. server -----------------------------------------
    // `dataMode` toggles between two ways of getting rows onto the screen:
    //  - "client": fetch the *entire* dataset once (here, `demoData`) and do
    //    all search/status/date filtering in the browser via `useMemo` below.
    //    Simple, but doesn't scale to large datasets.
    //  - "server": every time a filter, sort, or page changes, call
    //    `fetchServerSide` (a stand-in for a real API request) and use
    //    whatever rows/total count it returns. This is the shape you'd use
    //    for a real backend: replace the body of `fetchServerSide` with an
    //    actual `fetch`/query-client call that accepts the same params.
    const [dataMode, setDataMode] = useState<"client" | "server">("client")
    const [serverRows, setServerRows] = useState<IData[]>([])
    const [serverTotalCount, setServerTotalCount] = useState(0)
    const [isFetching, setIsFetching] = useState(false)

    /**
     * Mock "server" endpoint: filters, sorts and paginates `data` exactly like
     * the client-side `useMemo` below, but asynchronously and returning only
     * one page of rows plus a total count — the shape a real paginated API
     * would return. Replace the body with a real request, e.g.:
     *
     *   const res = await api.users.list({ search, statuses, joinedRange, sorting, pagination })
     *   return { rows: res.items, totalCount: res.total }
     */
    const fetchServerSide = async (params: {
        search: string
        statuses: string[]
        range: DateRange | undefined
        sort: SortingState
        page: PaginationState
    }): Promise<{ rows: IData[]; totalCount: number }> => {
        // Simulated network latency so the loading state is actually visible.
        await new Promise((resolve) => setTimeout(resolve, 400))

        const filtered = data.filter((item) => {
            const matchesStatus =
                !params.statuses.length || params.statuses.includes(item.status)

            const searchLower = params.search.toLowerCase()
            const matchesSearch =
                !params.search ||
                Object.values(item)
                    .filter((v) => typeof v !== "object" && typeof v !== "function")
                    .join(" ")
                    .toLowerCase()
                    .includes(searchLower)

            const joinedDateValue =
                item.joinedDate instanceof Date
                    ? item.joinedDate
                    : item.joinedDate
                        ? new Date(item.joinedDate)
                        : undefined
            const matchesDate = matchesDateRange(joinedDateValue, params.range)

            return matchesStatus && matchesSearch && matchesDate
        })

        const sorted = params.sort.length
            ? [...filtered].sort((a, b) => {
                const {id, desc} = params.sort[0]
                const av = String(a[id as keyof IData] ?? "")
                const bv = String(b[id as keyof IData] ?? "")
                return desc ? bv.localeCompare(av) : av.localeCompare(bv)
            })
            : filtered

        const start = params.page.pageIndex * params.page.pageSize
        const end = start + params.page.pageSize

        return {rows: sorted.slice(start, end), totalCount: sorted.length}
    }

    // Re-fetch whenever any filter/sort/pagination input changes, but only
    // while in "server" mode. In "client" mode filtering happens synchronously
    // in the `filteredData` memo below instead.
    useEffect(() => {
        if (dataMode !== "server") return

        let cancelled = false
        setIsFetching(true)

        fetchServerSide({
            search: searchQuery,
            statuses: selectedStatuses,
            range: joinedRange,
            sort: sorting,
            page: pagination,
        }).then(({rows, totalCount}) => {
            if (cancelled) return
            setServerRows(rows)
            setServerTotalCount(totalCount)
            setIsFetching(false)
        })

        return () => {
            cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dataMode, data, searchQuery, selectedStatuses, joinedRange, sorting, pagination])

    // Update filteredData
    // In "client" mode this fully filters `data` in the browser. In "server"
    // mode the server has already filtered *and* paginated the rows for us
    // (see `serverRows` above), so we just pass those straight through.
    const clientFilteredData = useMemo(() => {
        return data.filter((item) => {
            const matchesStatus =
                !selectedStatuses?.length || selectedStatuses.includes(item.status)

            const searchLower = searchQuery.toLowerCase()
            const matchesSearch =
                !searchQuery ||
                Object.values(item)
                    .filter((v) => typeof v !== "object" && typeof v !== "function")
                    .join(" ")
                    .toLowerCase()
                    .includes(searchLower)

            // Bug fix: `joinedDate` can be a string (some demo rows use `""`),
            // but `matchesDateRange` only accepts `Date | null | undefined`.
            // Normalize it to a `Date` (or `undefined`) before passing it in.
            const joinedDateValue =
                item.joinedDate instanceof Date
                    ? item.joinedDate
                    : item.joinedDate
                        ? new Date(item.joinedDate)
                        : undefined
            const matchesDate = matchesDateRange(joinedDateValue, joinedRange)

            return matchesStatus && matchesSearch && matchesDate
        })
    }, [data, searchQuery, selectedStatuses, joinedRange])

    const filteredData = dataMode === "server" ? serverRows : clientFilteredData

    // Total matching row count, used for `recordCount`/`pageCount`. In server
    // mode this comes from the server's response since only one page of rows
    // is ever present on the client at a time.
    const totalRowCount =
        dataMode === "server" ? serverTotalCount : clientFilteredData.length

    const statusCounts = useMemo(() => {
        return data.reduce(
            (acc, item) => {
                acc[item.status] = (acc[item.status] || 0) + 1
                return acc
            },
            {} as Record<string, number>
        )
    }, [data])

    const handleStatusChange = (checked: boolean, value: string) => {
        setSelectedStatuses(
            (
                prev = [] // Default to an empty array
            ) => (checked ? [...prev, value] : prev.filter((v) => v !== value))
        )
    }

    // Whether any search/filter is currently narrowing the result set. Used to
    // pick the right empty-state copy/illustration below: "no results match
    // your filters" (with a "Clear filters" action) vs. a true "no data yet".
    const hasActiveFilters =
        searchQuery.length > 0 || selectedStatuses.length > 0 || !!joinedRange

    const handleClearFilters = () => {
        setSearchQuery("")
        setSelectedStatuses([])
        setJoinedRange(undefined)
    }

    // Renders a column's `meta.skeleton` in place of its normal content while
    // the row's id is present in `deletingIds` — i.e. while it's mid-deletion.
    // Used below by every column's `cell` so the whole row visibly "melts"
    // into loading placeholders instead of just disappearing when deleted.
    const renderWithDeleteSkeleton = (
        skeleton: ReactNode,
        render: (row: Row<DataGridFeatures, IData>) => ReactNode
    ) => {
        return ({row}: { row: Row<DataGridFeatures, IData> }) =>
            deletingIds.has(row.original.id) ? skeleton : render(row)
    }

    const columns = useMemo<ColumnDef<DataGridFeatures, IData>[]>(
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
                meta: {
                    headerClassName: "",
                    cellClassName: "",
                    skeleton: <Skeleton className="h-4.5 w-4.5"/>,
                },
                enableResizing: false,
            },
            {
                accessorKey: "name",
                id: "name",
                header: ({column}) => (
                    <DataGridColumnHeader
                        title="User"
                        visibility={true}
                        column={column}
                    />
                ),
                cell: renderWithDeleteSkeleton(
                    <Skeleton className="h-7 w-auto"/>,
                    (row) => (
                        <div className="flex items-center gap-3">
                            <Avatar className="size-8">
                                <AvatarImage
                                    src={row.original.avatar}
                                    alt={row.original.name}
                                />
                                <AvatarFallback>
                                    {row.original.name
                                        .split(" ")
                                        .map((n) => n[0])
                                        .join("")}
                                </AvatarFallback>
                            </Avatar>
                            <div className="space-y-px">
                                <div className="text-foreground font-medium">
                                    {row.original.name}
                                </div>
                                <div className="text-muted-foreground">
                                    {row.original.email}
                                </div>
                            </div>
                        </div>
                    )
                ),
                size: 260,
                meta: {
                    autoSize: true,
                    skeleton: <Skeleton className="h-7 w-auto"/>,
                },
                enableSorting: true,
                enableHiding: false,
                enableResizing: true,
            },
            {
                accessorKey: "location",
                id: "location",
                header: ({column}) => (
                    <DataGridColumnHeader
                        title="Location"
                        visibility={true}
                        column={column}
                    />
                ),
                cell: renderWithDeleteSkeleton(
                    <Skeleton className="h-7 w-auto"/>,
                    (row) => (
                        <div className="flex items-center gap-1.5">
                            <img
                                src={`https://flagcdn.com/${row.original.flag.toLowerCase()}.svg`}
                                alt={row.original.flag}
                                className="size-4 rounded-full object-cover"
                            />
                            <div className="text-foreground font-medium">
                                {row.original.location}
                            </div>
                        </div>
                    )
                ),
                size: 150,
                meta: {
                    headerClassName: "",
                    cellClassName: "text-start",
                    skeleton: <Skeleton className="h-7 w-auto"/>,
                },
                enableSorting: true,
                enableHiding: true,
                enableResizing: true,
            },
            {
                accessorKey: "role",
                id: "role",
                header: ({column}) => (
                    <DataGridColumnHeader
                        title="Role"
                        visibility={true}
                        column={column}
                    />
                ),
                cell: renderWithDeleteSkeleton(
                    <Skeleton className="h-7 w-auto"/>,
                    (row) => (
                        <div className="text-foreground font-medium">
                            {row.original.role}
                        </div>
                    )
                ),
                size: 150,
                meta: {
                    skeleton: <Skeleton className="h-7 w-auto"/>,
                },
                enableSorting: true,
                enableHiding: true,
                enableResizing: true,
            },
            {
                accessorKey: "joined",
                id: "joined",
                header: ({column}) => (
                    <DataGridColumnHeader
                        title="Joined"
                        visibility={true}
                        column={column}
                    />
                ),
                cell: renderWithDeleteSkeleton(
                    <Skeleton className="h-7 w-auto"/>,
                    (row) => (
                        <div className="text-foreground font-medium">
                            {row.original.joined}
                        </div>
                    )
                ),
                size: 150,
                meta: {
                    skeleton: <Skeleton className="h-7 w-auto"/>,
                },
                enableSorting: true,
                enableHiding: true,
                enableResizing: true,
            },
            {
                accessorKey: "status",
                id: "status",
                header: ({column}) => (
                    <DataGridColumnHeader
                        title="Status"
                        visibility={true}
                        column={column}
                    />
                ),
                cell: renderWithDeleteSkeleton(
                    <Skeleton className="h-7 w-auto"/>,
                    (row) => {
                        const status = row.original.status

                        if (status == "Active") {
                            return <Badge variant="success-outline">Approved</Badge>
                        } else if (status == "Blocked") {
                            return <Badge variant="destructive-outline">Blocked</Badge>
                        } else if (status == "Inactive") {
                            return <Badge variant="info-outline">Inactive</Badge>
                        } else {
                            return <Badge variant="warning-outline">Pending</Badge>
                        }
                    }
                ),
                size: 100,
                meta: {
                    skeleton: <Skeleton className="h-7 w-auto"/>,
                },
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
                        // Bug fix: this previously called a non-existent
                        // `setEditingRowRef.current(...)`, which would throw at runtime
                        // as soon as a user clicked "Edit". Wire all three callbacks
                        // directly to the state setters declared above.
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
                meta: {
                    skeleton: <Skeleton className="h-6 w-6"/>,
                },
                enableSorting: false,
                enableHiding: false,
                enableResizing: false,
            },
        ],
        // `deletingIds` is a dependency because `renderWithDeleteSkeleton`
        // (and the disabled state of the actions menu) reads it directly.
        [deletingIds]
    )

    const [columnOrder, setColumnOrder] = useState<string[]>(
        columns.map((column) => column.id as string)
    )

    const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

    const table = useTable({
        features: dataGridFeatures,
        columns,
        data: filteredData,
        // In "server" mode `filteredData` is already just one page of rows, so
        // `pageCount` must come from the server's reported `totalRowCount`
        // rather than from `filteredData.length` (which is only a page size).
        pageCount: Math.ceil((totalRowCount || 0) / pagination.pageSize),
        getRowId: (row: IData) => row.id,
        enableRowSelection: true,
        state: {
            pagination,
            sorting,
            columnOrder,
            rowSelection,
        },
        onRowSelectionChange: setRowSelection,
        onColumnOrderChange: setColumnOrder,
        onPaginationChange: setPagination,
        onSortingChange: setSorting,
    })

    const {exportSelected} = useTableCSVExport(table, exportColumns)

    // --- Actions functions --------------------------------------------------

    /**
     * Persists changes made in the edit sheet.
     * Bug fix: this previously referenced an undefined `selectedCount` and a
     * non-existent `setIsEditSheetOpen` setter (only the derived boolean
     * `isEditSheetOpen` existed, not its setter). Closing the sheet is done
     * by clearing `editingRow`, since `isEditSheetOpen` is derived from it.
     *
     * In a real app, replace the `setData` call with your update mutation
     * (e.g. `await api.updateUser(editingRow.id, formValues)`), then update
     * local/query-cache state once the request succeeds.
     */
    const handleSave = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (!editingRow) return

        // Example of reading edited values back out of the form. Replace with
        // whatever fields your `formContent` actually renders.
        const formData = new FormData(event.currentTarget)
        const updatedName = (formData.get("name") as string) || editingRow.name

        setData((prev) =>
            prev.map((item) =>
                item.id === editingRow.id ? {...item, name: updatedName} : item
            )
        )

        toast.success(`Updated ${editingRow.name}`)
        setEditingRow(null)
    }

    /**
     * Removes a single row after the user confirms in the `AlertDialog` below.
     * In a real app, replace `setData` with your delete mutation — ideally
     * `await`ed before clearing `deletingIds`, so the skeleton stays up for
     * the *real* duration of the request instead of (or in addition to) the
     * fixed `DELETE_ANIMATION_MS` timeout below.
     */
    const handleConfirmDelete = () => {
        if (!deletingRow) return
        const {id, name} = deletingRow

        // Show the skeleton immediately and close the confirmation dialog...
        setDeletingIds((prev) => new Set(prev).add(id))
        setDeletingRow(null)

        // ...then actually remove the row once the minimum skeleton duration
        // has elapsed (or once your real delete request resolves).
        setTimeout(() => {
            setData((prev) => prev.filter((item) => item.id !== id))
            setDeletingIds((prev) => {
                const next = new Set(prev)
                next.delete(id)
                return next
            })
            toast.success(`Deleted ${name}`)
        }, DELETE_ANIMATION_MS)
    }

    /**
     * Bulk delete, hooked up to the `TableActionBar`'s selection toolbar.
     * Uses the table's row selection state to know which ids to remove.
     * Mirrors `handleConfirmDelete`'s skeleton-then-remove pattern above, just
     * for every selected id at once.
     */
    const handleBulkDelete = () => {
        const selectedIds = Object.keys(rowSelection)
        if (selectedIds.length === 0) return

        setDeletingIds((prev) => {
            const next = new Set(prev)
            selectedIds.forEach((id) => next.add(id))
            return next
        })
        table.toggleAllRowsSelected(false)

        setTimeout(() => {
            setData((prev) => prev.filter((item) => !selectedIds.includes(item.id)))
            setDeletingIds((prev) => {
                const next = new Set(prev)
                selectedIds.forEach((id) => next.delete(id))
                return next
            })
            toast.success(`Deleted ${selectedIds.length} row(s)`)
        }, DELETE_ANIMATION_MS)
    }

    return (
        <>
            <DataGrid
                table={table}
                recordCount={totalRowCount || 0}
                tableLayout={{
                    columnsPinnable: true,
                    columnsResizable: true,
                    columnsMovable: true,
                    columnsVisibility: true,
                }}
                // Full-table skeleton shows for the manual `isLoading` toggle (demo
                // button above) as well as whenever a "server" mode fetch is in
                // flight. Per-row delete skeletons (`deletingIds`) are independent of
                // this and rendered by the columns themselves.
                isLoading={isLoading || isFetching}
                // Rendered by `DataGridTableEmpty` inside a single spanning `<td>`
                // whenever `filteredData` is empty. Swaps copy/illustration depending
                // on whether the emptiness is caused by an active filter (with a
                // "Clear filters" action) or there simply being no data at all — swap
                // the "no data" branch's title/description/action for your own
                // "create" flow when adapting this template.
                emptyMessage={
                    hasActiveFilters ? (
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
                            title="No users yet"
                            description="Users you add will show up here."
                        />
                    )
                }
            >
                <TableActionBar
                    table={table}
                    onExport={() => exportSelected("users")}
                    onDelete={handleBulkDelete}
                />
                <Card className="w-full gap-3 py-0 mt-4">
                    <CardHeader className="flex items-center justify-between px-3.5 py-2">
                        <div className="flex items-center gap-2.5">
                            <InputGroup className="w-48">
                                <InputGroupAddon align="inline-start">
                                    <SearchIcon
                                    />
                                </InputGroupAddon>

                                <InputGroupInput
                                    placeholder="Search..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />

                                {searchQuery.length > 0 && (
                                    <InputGroupAddon align="inline-end">
                                        <InputGroupButton
                                            aria-label="Copy"
                                            title="Copy"
                                            size="icon-xs"
                                            onClick={() => setSearchQuery("")}
                                        >
                                            <XIcon
                                            />
                                        </InputGroupButton>
                                    </InputGroupAddon>
                                )}
                            </InputGroup>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline">
                                        <FunnelIcon
                                        />
                                        Status
                                        {selectedStatuses.length > 0 && (
                                            <Badge size="sm" variant="info-outline">
                                                {selectedStatuses.length}
                                            </Badge>
                                        )}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-40" align="start">
                                    <div className="space-y-3">
                                        <div className="text-muted-foreground text-xs font-medium">
                                            Filters
                                        </div>
                                        <div className="space-y-3">
                                            {Object.keys(statusCounts).map((status) => (
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
                                                        {status}
                                                        <span className="text-muted-foreground">
                            {statusCounts[status]}
                          </span>
                                                    </Label>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>

                            {/* Date Range Filter — reusable component, no recreation */}
                            <DateRangePicker
                                placeholder="Joined date"
                                value={joinedRange}
                                onChange={setJoinedRange}
                                align="start"
                                showLabel={false}
                            />
                        </div>
                        <CardAction>
                            <Button>
                                <UserPlusIcon
                                />
                                Add new
                            </Button>
                            {/* DATA MODE TOGGLE — switches between client-side filtering
                (everything filtered in the browser, see `clientFilteredData`)
                and server-side filtering (see `fetchServerSide`/`useEffect`
                above). Both modes reuse the exact same table/columns/actions
                below them; only how `filteredData` is produced changes. */}
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                    setDataMode((prev) => (prev === "client" ? "server" : "client"))
                                }
                            >
                                Mode: {dataMode === "client" ? "Client-side" : "Server-side"}
                            </Button>
                            <Button variant="outline" size="sm" onClick={handleToggleLoading}>
                                {isLoading ? "Disable Loading" : "Enable Loading"}
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
                        <DataGridPagination sizes={[8, 16, 32, 50, 100, 500]}/>
                    </CardFooter>
                </Card>
            </DataGrid>

            {/* ------------------------------------------------------------------
        EDIT SHEET — how to hook a row's "Edit" action to `ReusableSheet`
        ------------------------------------------------------------------
        `ReusableSheet` normally opens via its own `trigger` prop, but a
        row action doesn't render its own trigger button — it's a dropdown
        item deep inside the table. So instead we:
          1. Render exactly one `ReusableSheet` here, outside the table.
          2. Omit `trigger` and instead pass the controlled `open` /
             `onOpenChange` props, driven by the `editingRow` state.
          3. `ActionsCell`'s "Edit" item calls `onEdit(row.original)`, which
             sets `editingRow`, which opens this sheet with that row's data.
          4. `formContent` renders the fields for the row being edited
             (falling back gracefully while `editingRow` is null so the
             sheet can still mount/unmount smoothly during its close
             animation).
          5. Submitting the form calls `handleSave`, which updates `data`
             and clears `editingRow` (closing the sheet).
        To adapt this to your own dataset, replace the fields inside
        `formContent` with inputs for your record's actual properties. */}
            <ReusableSheet
                title="Edit user"
                description="Update this user's details and save your changes."
                open={isEditSheetOpen}
                onOpenChange={(open) => {
                    if (!open) setEditingRow(null)
                }}
                onSubmit={handleSave}
                children={
                    editingRow && (
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="edit-name">Name</Label>
                                <Input
                                    id="edit-name"
                                    name="name"
                                    defaultValue={editingRow.name}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="edit-email">Email</Label>
                                <Input
                                    id="edit-email"
                                    name="email"
                                    defaultValue={editingRow.email}
                                    disabled
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="edit-role">Role</Label>
                                <Input
                                    id="edit-role"
                                    name="role"
                                    defaultValue={editingRow.role}
                                />
                            </div>
                        </div>
                    )
                }
            />

            {/* ------------------------------------------------------------------
        VIEW SHEET — an empty reusable container wired up for a future
        read-only "view" UI
        ------------------------------------------------------------------
        Same wiring pattern as the edit sheet above: `ActionsCell`'s "View"
        item calls `onView(row.original)`, which sets `viewingRow`, which
        opens this second, independent `ReusableSheet` instance with that
        row's data.

        Deliberately left as an *empty container* for now — the `children`
        below only prove the row data reaches the sheet (printing the id/
        name so you can see it working). No `footer` prop is provided
        because a pure "view" doesn't need Save/Cancel actions. When you're
        ready to build the real view for your dataset:
          1. Replace the placeholder content inside `children` below with
             your read-only layout for `viewingRow` (e.g. a details grid,
             tabs, etc.).
          2. Everything else — state, the dropdown item, opening/closing —
             already works and doesn't need to change. */}
            <ReusableSheet
                title="View user"
                description="Read-only details for this record."
                open={isViewSheetOpen}
                onOpenChange={(open) => {
                    if (!open) setViewingRow(null)
                }}
            >
                {viewingRow && (
                    // Placeholder content only — swap this for the actual read-only
                    // view once it's designed. `viewingRow` already carries the full
                    // record, so no extra data-fetching is needed here.
                    <div className="text-muted-foreground text-sm">
                        Viewing <span className="text-foreground font-medium">{viewingRow.name}</span>{" "}
                        (id: {viewingRow.id}) — build the real read-only view here.
                    </div>
                )}
            </ReusableSheet>

            {/* ------------------------------------------------------------------
        DELETE CONFIRMATION — how to hook a row's "Delete" action
        ------------------------------------------------------------------
        Same idea as the edit sheet: `ActionsCell`'s "Delete" item calls
        `onDelete(row.original)`, which sets `deletingRow`. That drives this
        single `AlertDialog` instance's open state. Confirming calls
        `handleConfirmDelete`, which removes the row from `data` and clears
        `deletingRow` (closing the dialog). This mirrors the bulk-delete
        flow used by `TableActionBar`'s `onDelete={handleBulkDelete}` above,
        so both single-row and multi-row deletion share the same `data`
        source of truth. */}
            <AlertDialog
                open={isDeleteDialogOpen}
                onOpenChange={(open) => {
                    if (!open) setDeletingRow(null)
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete user</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete {deletingRow?.name}? This action
                            cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmDelete}>
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}