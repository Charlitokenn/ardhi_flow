import {useEffect, useMemo, useState} from "react";
import {useAuth, useUser} from "@clerk/react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {apiClient} from "@/lib/api.ts";
import {Badge} from "@/components/reui/badge.tsx";
import {Avatar, AvatarFallback} from "@/components/ui/avatar.tsx";
import {Frame, FrameHeader, FramePanel} from "@/components/reui/frame.tsx";
import {Textarea} from "@/components/ui/textarea.tsx";
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
import {
    FunnelIcon,
    MessageSquareTextIcon,
    MoreHorizontalIcon,
    PlusIcon,
    SearchIcon,
    Settings2Icon,
    SquarePenIcon,
    Trash2Icon,
    XIcon,
} from "lucide-react";
import {useTableCSVExport} from "../../../../../../packages/api-client/src/index.ts";
import {TableActionBar} from "@/components-reusable/reusable-table-action-bar.tsx";
import {type ExportColumn} from "@/lib/export-csv.ts";
import ReusableSheet from "@/components-reusable/reusable-sheet.tsx";
import {ReusableDeleteDialog} from "@/components-reusable/reusable-delete.tsx";
import ReusableTimeline, {type ReusableTimelineItem,} from "@/components-reusable/reusable-timeline.tsx";
import {Skeleton} from "@/components/ui/skeleton.tsx";
import {ReusableEmpty, SearchCardsIllustration,} from "@/components-reusable/reusable-empty.tsx";
import {ArchiveIcon, ChatLineIcon} from "@/assets/icons";
import {cn, formatDate, formatDateTimeShort, thousandSeparator,} from "@/lib/utils.ts";
import {DataGridTableVirtual} from "@/components/reui/data-grid/data-grid-table-virtual";
import ReusableTooltip from "@/components-reusable/reusable-tooltip.tsx";
import {ReusableEventsCalendar} from "@/components-reusable/reusable-event-calendar.tsx";
import type {CalendarEvent, EventCalendarOccurrence,} from "@/components/reui/event-calendar/event-calendar-types";
import {ScrollArea} from "@/components/ui/scroll-area.tsx";
import {addDays, startOfDay} from "date-fns";
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
    // Free-text name of whoever logged the comment. Null/empty for
    // system-generated entries (e.g. an automatic delinquency marker) —
    // those are attributed to "ArdhiFlow System" in the UI.
    createdBy: string | null;
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

/** Human-entered comments carry the staff member's name in `createdBy`;
 *  system-generated entries (e.g. an automatic delinquency marker) leave it
 *  blank, so those are attributed to ArdhiFlow itself. */
function commentAuthorLabel(comment: IInstallmentComment): string {
    return comment.createdBy?.trim() || "ArdhiFlow System";
}

/** Small popover of row actions ("Edit comment" / "Delete Comment") that
 *  sits at the far right of a comment's title row, next to createdBy.
 *  Presentational only — CommentCard owns what each action actually does. */
function CommentActionsPopover({
                                   onEdit,
                                   onDeleteClick,
                               }: {
    onEdit: () => void;
    onDeleteClick: () => void;
}) {
    const [open, setOpen] = useState(false);
    const itemClassName =
        "group/dropdown-menu-item relative flex min-h-7 w-full cursor-default items-center gap-2 rounded-md px-2 py-1 text-left text-xs/relaxed outline-hidden select-none hover:bg-accent hover:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5";

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground size-6 shrink-0"
                >
                    <MoreHorizontalIcon className="size-3.5"/>
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-40 p-1">
                <button
                    type="button"
                    className={itemClassName}
                    onClick={() => {
                        setOpen(false);
                        onEdit();
                    }}
                >
                    <SquarePenIcon/>
                    Edit comment
                </button>
                <button
                    type="button"
                    className={cn(
                        itemClassName,
                        "text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20 [&_svg]:text-destructive",
                    )}
                    onClick={() => {
                        setOpen(false);
                        onDeleteClick();
                    }}
                >
                    <Trash2Icon/>
                    Delete Comment
                </button>
            </PopoverContent>
        </Popover>
    );
}

/** One comment card: avatar + createdBy + actions popover up top, message
 *  below. System-generated entries (e.g. an automatic delinquency marker —
 *  eventType other than FOLLOWUP_COMMENT) get no actions popover, since
 *  they're part of the audit trail rather than something a user wrote.
 *  Clicking "Edit comment" turns the message into a Textarea in place, with
 *  Save/Cancel; "Delete Comment" opens a confirm dialog before removing it. */
function CommentCard({
                         comment,
                         onEdit,
                         onDelete,
                         isEditPending,
                         isDeletePending,
                     }: {
    comment: IInstallmentComment;
    onEdit: (
        commentId: string,
        message: string,
        callbacks: { onSuccess: () => void },
    ) => void;
    onDelete: (commentId: string, callbacks: { onSuccess: () => void }) => void;
    isEditPending: boolean;
    isDeletePending: boolean;
}) {
    const [isEditing, setIsEditing] = useState(false);
    const [draft, setDraft] = useState(comment.message ?? "");
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const author = commentAuthorLabel(comment);
    const isUserComment = comment.eventType === "FOLLOWUP_COMMENT";

    return (
        <Frame spacing="sm" className="w-full">
            <FrameHeader className="flex-row items-center gap-2">
                <Avatar className="size-5">
                    <AvatarFallback className="text-[10px]">
                        {initials(author)}
                    </AvatarFallback>
                </Avatar>
                <span className="text-muted-foreground flex-1 text-xs font-medium">
          {author}
        </span>
                {isUserComment && !isEditing && (
                    <CommentActionsPopover
                        onEdit={() => {
                            setDraft(comment.message ?? "");
                            setIsEditing(true);
                        }}
                        onDeleteClick={() => setConfirmingDelete(true)}
                    />
                )}
            </FrameHeader>
            <FramePanel>
                {isEditing ? (
                    <div className="space-y-2">
                        <Textarea
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            rows={3}
                            autoFocus
                        />
                        <div className="flex justify-end gap-2">
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={isEditPending}
                                onClick={() => setIsEditing(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                disabled={!draft.trim() || isEditPending}
                                onClick={() =>
                                    onEdit(comment.id, draft.trim(), {
                                        onSuccess: () => setIsEditing(false),
                                    })
                                }
                            >
                                {isEditPending ? "Saving..." : "Save"}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <p className="text-sm leading-relaxed">{comment.message ?? "—"}</p>
                )}
            </FramePanel>

            {isUserComment && (
                <ReusableDeleteDialog
                    open={confirmingDelete}
                    onOpenChange={setConfirmingDelete}
                    title="Delete this comment?"
                    description="This can't be undone — the comment will be permanently removed."
                    icon={<Trash2Icon className="size-5"/>}
                    isDeleting={isDeletePending}
                    onDelete={() =>
                        onDelete(comment.id, {
                            onSuccess: () => setConfirmingDelete(false),
                        })
                    }
                />
            )}
        </Frame>
    );
}

/** Maps installment comments into ReusableTimeline's generic item shape —
 *  latest first (so the timeline numbers them down from the total count),
 *  step title = timestamp, content = a CommentCard rendered inside the same
 *  Frame primitive used for the "add comment" trigger above it. */
function commentsToTimelineItems(
    comments: IInstallmentComment[],
    handlers: {
        onEdit: (
            commentId: string,
            message: string,
            callbacks: { onSuccess: () => void },
        ) => void;
        onDelete: (commentId: string, callbacks: { onSuccess: () => void }) => void;
        isEditPending: (commentId: string) => boolean;
        isDeletePending: (commentId: string) => boolean;
    },
): ReusableTimelineItem[] {
    return [...comments]
        .sort((a, b) => {
            const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return bTime - aTime;
        })
        .map((comment) => ({
            id: comment.id,
            title: comment.createdAt ? formatDateTimeShort(comment.createdAt) : "—",
            content: (
                <CommentCard
                    comment={comment}
                    onEdit={handlers.onEdit}
                    onDelete={handlers.onDelete}
                    isEditPending={handlers.isEditPending(comment.id)}
                    isDeletePending={handlers.isDeletePending(comment.id)}
                />
            ),
        }));
}

/** A dashed placeholder shaped like the same Frame used for each comment
 *  (see commentsToTimelineItems) that sits above the latest comment. Click
 *  opens a popover with a textarea to write and submit a new follow-up
 *  comment. Stays presentational — the caller supplies `onSubmit`, which
 *  receives the trimmed message plus a callback to fire once the save
 *  succeeds (closes the popover and clears the draft). */
function AddCommentTrigger({
                               onSubmit,
                               isPending,
                           }: {
    onSubmit: (message: string, callbacks: { onSuccess: () => void }) => void;
    isPending: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [message, setMessage] = useState("");

    return (
        <Popover
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (!next) setMessage("");
            }}
        >
            <PopoverTrigger asChild>
                <button type="button" className="block w-full text-left">
                    <Frame
                        spacing="sm"
                        className="w-full items-center justify-center border-dashed py-3 transition-colors hover:bg-muted/50"
                    >
                        <div
                            className="text-muted-foreground flex items-center justify-center gap-1.5 text-xs font-medium">
                            <PlusIcon className="size-3.5"/>
                            Add comment
                        </div>
                    </Frame>
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="start">
                <div className="space-y-2.5">
                    <Label
                        htmlFor="new-installment-comment"
                        className="text-xs font-medium"
                    >
                        New comment
                    </Label>
                    <Textarea
                        id="new-installment-comment"
                        placeholder="Write a comment..."
                        rows={4}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        autoFocus
                    />
                    <div className="flex justify-end gap-2">
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                                setOpen(false);
                                setMessage("");
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            disabled={!message.trim() || isPending}
                            onClick={() =>
                                onSubmit(message.trim(), {
                                    onSuccess: () => {
                                        setOpen(false);
                                        setMessage("");
                                    },
                                })
                            }
                        >
                            {isPending ? "Saving..." : "Submit"}
                        </Button>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
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
    const {user} = useUser();
    const api = apiClient(getToken);
    const queryClient = useQueryClient();

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

    // Logs a follow-up comment against whichever installment is open in the
    // sheet (see the AddCommentTrigger inside ReusableTimeline below).
    // `viewingRow` is a snapshot of the row, not a live subscription to the
    // installments query, so success also appends the new comment onto it
    // directly — that's what makes the sheet reflect it immediately, on top
    // of invalidating ["installments"] so the grid's own comment count
    // catches up next time it renders.
    const addCommentMutation = useMutation({
        mutationFn: async ({
                               installmentId,
                               message,
                               createdBy,
                           }: {
            installmentId: string;
            message: string;
            createdBy: string | null;
        }) => {
            const res = await api.api.installments[":id"].comments.$post({
                param: {id: installmentId},
                json: {message, createdBy},
            });
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                const errorMessage =
                    (body && typeof body === "object" && "error" in body
                        ? (body as { error?: string }).error
                        : null) ?? "Failed to add comment";
                throw new Error(errorMessage);
            }
            return res.json();
        },
        onSuccess: (created) => {
            setViewingRow((prev) =>
                prev
                    ? {
                        ...prev,
                        comments: [
                            ...prev.comments,
                            created as unknown as IInstallmentComment,
                        ],
                    }
                    : prev,
            );
            queryClient.invalidateQueries({queryKey: ["installments"]});
        },
        onError: (err) => {
            toast.error(err instanceof Error ? err.message : "Failed to add comment");
        },
    });

    function handleAddComment(
        message: string,
        callbacks: { onSuccess: () => void },
    ) {
        if (!viewingRow) return;
        addCommentMutation.mutate(
            {
                installmentId: viewingRow.id,
                message,
                createdBy: user?.fullName?.trim() || user?.username || null,
            },
            {onSuccess: callbacks.onSuccess},
        );
    }

    // Edits a comment's message in place (see CommentCard's inline
    // textarea). Same local-state-append pattern as addCommentMutation
    // above: viewingRow is a snapshot, so success also patches it directly
    // rather than waiting on the invalidated query to refetch.
    const editCommentMutation = useMutation({
        mutationFn: async ({
                               installmentId,
                               commentId,
                               message,
                           }: {
            installmentId: string;
            commentId: string;
            message: string;
        }) => {
            const res = await api.api.installments[":id"].comments[
                ":commentId"
                ].$patch({
                param: {id: installmentId, commentId},
                json: {message},
            });
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                const errorMessage =
                    (body && typeof body === "object" && "error" in body
                        ? (body as { error?: string }).error
                        : null) ?? "Failed to update comment";
                throw new Error(errorMessage);
            }
            return res.json();
        },
        onSuccess: (updated, variables) => {
            setViewingRow((prev) =>
                prev
                    ? {
                        ...prev,
                        comments: prev.comments.map((c) =>
                            c.id === variables.commentId
                                ? (updated as unknown as IInstallmentComment)
                                : c,
                        ),
                    }
                    : prev,
            );
            queryClient.invalidateQueries({queryKey: ["installments"]});
        },
        onError: (err) => {
            toast.error(
                err instanceof Error ? err.message : "Failed to update comment",
            );
        },
    });

    function handleEditComment(
        commentId: string,
        message: string,
        callbacks: { onSuccess: () => void },
    ) {
        if (!viewingRow) return;
        editCommentMutation.mutate(
            {installmentId: viewingRow.id, commentId, message},
            {onSuccess: callbacks.onSuccess},
        );
    }

    // Deletes a comment. Same local-state removal + invalidation pattern.
    const deleteCommentMutation = useMutation({
        mutationFn: async ({
                               installmentId,
                               commentId,
                           }: {
            installmentId: string;
            commentId: string;
        }) => {
            const res = await api.api.installments[":id"].comments[
                ":commentId"
                ].$delete({
                param: {id: installmentId, commentId},
            });
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                const errorMessage =
                    (body && typeof body === "object" && "error" in body
                        ? (body as { error?: string }).error
                        : null) ?? "Failed to delete comment";
                throw new Error(errorMessage);
            }
            return res.json();
        },
        onSuccess: (_data, variables) => {
            setViewingRow((prev) =>
                prev
                    ? {
                        ...prev,
                        comments: prev.comments.filter(
                            (c) => c.id !== variables.commentId,
                        ),
                    }
                    : prev,
            );
            queryClient.invalidateQueries({queryKey: ["installments"]});
        },
        onError: (err) => {
            toast.error(
                err instanceof Error ? err.message : "Failed to delete comment",
            );
        },
    });

    function handleDeleteComment(
        commentId: string,
        callbacks: { onSuccess: () => void },
    ) {
        if (!viewingRow) return;
        deleteCommentMutation.mutate(
            {installmentId: viewingRow.id, commentId},
            {onSuccess: callbacks.onSuccess},
        );
    }

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
                cell: ({row}) => {
                    const commentCount = row.original.comments.length;
                    return (
                        <div className="relative inline-flex">
                            <ReusableTooltip
                                orientation="left"
                                trigger={
                                    <MessageSquareTextIcon
                                        aria-hidden="true"
                                        className="size-4 cursor-pointer"
                                        onClick={() => setViewingRow(row.original)}
                                    />
                                }
                                tooltip={
                                    commentCount > 0
                                        ? `${commentCount} ${commentCount > 0 ? "comments" : "comment"}`
                                        : "No comments"
                                }
                            />
                            {commentCount > 0 && (
                                <Badge
                                    variant="warning"
                                    radius="full"
                                    className="pointer-events-none absolute w-2.5 h-2.5 -top-1 -inset-e-1 p-0 min-w-0 min-h-0"
                                    aria-hidden="true"
                                />
                            )}
                        </div>
                    );
                },
                size: 60,
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
                </Card>
            </DataGrid>

            <ReusableSheet
                title="Comments History"
                open={isViewSheetOpen}
                onOpenChange={(open) => {
                    if (!open) setViewingRow(null);
                }}
                widthClassName="w-100"
                children={
                    viewingRow && (
                        <ReusableTimeline
                            items={commentsToTimelineItems(viewingRow.comments, {
                                onEdit: handleEditComment,
                                onDelete: handleDeleteComment,
                                isEditPending: (commentId) =>
                                    editCommentMutation.isPending &&
                                    editCommentMutation.variables?.commentId === commentId,
                                isDeletePending: (commentId) =>
                                    deleteCommentMutation.isPending &&
                                    deleteCommentMutation.variables?.commentId === commentId,
                            })}
                            topSlot={
                                <AddCommentTrigger
                                    onSubmit={handleAddComment}
                                    isPending={addCommentMutation.isPending}
                                />
                            }
                            emptyState={
                                <div className="flex h-full flex-col gap-4">
                                    <ReusableEmpty
                                        title="No Comments here!"
                                        description="No comments to display here"
                                        media={<ChatLineIcon className="size-16"/>}
                                        children={
                                            <AddCommentTrigger
                                                onSubmit={handleAddComment}
                                                isPending={addCommentMutation.isPending}
                                            />
                                        }
                                    />
                                </div>
                            }
                        />
                    )
                }
            />
        </>
    );
}

// ---------------------------------------------------------------------------
// Recovery calendar — installments plotted on their due date, grouped per
// day since several installments can share one due date. Reuses the same
// status/amount helpers as the datagrid above so the two stay in sync.
// ---------------------------------------------------------------------------

/** Same urgency order the status filter uses (REMINDER_STATUSES) — picks the
 *  most urgent status present in a day's bucket to color that day's event. */
function dominantReminderStatus(statuses: ReminderStatus[]): ReminderStatus {
    for (const status of REMINDER_STATUSES) {
        if (statuses.includes(status)) return status;
    }
    return "OPEN";
}

/** Same semantic colors the status badges use (success/warning/destructive/
 *  info), as the CSS vars the calendar's `color` field expects. */
const REMINDER_STATUS_COLOR_VAR: Record<ReminderStatus, string> = {
    OVERDUE: "var(--color-destructive)",
    UPCOMING: "var(--color-warning)",
    OPEN: "var(--color-info)",
    PAID: "var(--color-success)",
};

/** Compact "2.5M" / "89.6K" style formatting for amounts that need to fit a
 *  calendar chip or a toolbar summary number — full comma-separated amounts
 *  (formatTzs) are too wide for either. */
function formatCompactAmount(value: number): string {
    const abs = Math.abs(value);
    let scaled: number;
    let suffix: string;
    if (abs >= 1_000_000) {
        scaled = value / 1_000_000;
        suffix = "M";
    } else if (abs >= 1_000) {
        scaled = value / 1_000;
        suffix = "K";
    } else {
        return thousandSeparator(value);
    }
    const trimmed = scaled.toFixed(2).replace(/\.?0+$/, "");
    return `${trimmed}${suffix}`;
}

interface InstallmentCalendarEventData {
    installments: IInstallment[];
    totalOutstanding: number;
    status: ReminderStatus;
}

/** Groups installments by due date (local calendar day) into one all-day
 *  event per day, titled with that day's total outstanding amount.
 *  Installments that are already fully paid off (outstanding = 0) are
 *  excluded — only installments still owing something show up on the
 *  calendar. */
function buildInstallmentCalendarEvents(
    installments: IInstallment[],
): CalendarEvent<InstallmentCalendarEventData>[] {
    const buckets = new Map<number, IInstallment[]>();
    for (const installment of installments) {
        if (computeOutstanding(installment) <= 0) continue;
        const due = new Date(installment.dueDate);
        if (Number.isNaN(due.getTime())) continue;
        const key = startOfDay(due).getTime();
        const bucket = buckets.get(key);
        if (bucket) bucket.push(installment);
        else buckets.set(key, [installment]);
    }

    return Array.from(buckets.entries()).map(([key, dayInstallments]) => {
        const dayStart = new Date(key);
        const totalOutstanding = dayInstallments.reduce(
            (sum, item) => sum + computeOutstanding(item),
            0,
        );
        const status = dominantReminderStatus(
            dayInstallments.map((item) => computeReminderStatus(item)),
        );
        return {
            id: `installments-${key}`,
            title: formatTzs(totalOutstanding),
            start: dayStart,
            end: addDays(dayStart, 1),
            allDay: true,
            color: REMINDER_STATUS_COLOR_VAR[status],
            data: {installments: dayInstallments, totalOutstanding, status},
        };
    });
}

/** One installment row inside an event's hover tooltip — avatar, bold client
 *  name with a project-name badge on the header row, outstanding amount on
 *  the row below. Same avatar + bold-name-with-badge / detail-row-beneath
 *  shape used for contact cards elsewhere in the app. */
function InstallmentTooltipRow({installment}: { installment: IInstallment }) {
    const clientName = installment.contract?.client?.fullName ?? "Unknown client";
    const projectName = installment.plot?.project?.projectName ?? "—";
    const installmentNumber = installment.installmentNo ?? "-";
    const plotNumber = installment.plot?.plotNumber ?? "-"
    return (
        <div className="flex flex-col gap-1.5 border-b py-2.5 last:border-b-0">
            <div className="flex items-center gap-2">
                <div className="flex flex-1 min-w-0 items-center gap-2">
                    <Avatar className="size-6 shrink-0">
                        <AvatarFallback className="text-2xs">
                            {initials(clientName)}
                        </AvatarFallback>
                    </Avatar>
                    <div className="flex min-w-0 flex-col space-y-0">
            <span className="min-w-0 truncate text-xs font-semibold">
              {clientName}
            </span>
                        <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                            {installmentNumber > 0
                                ? `Installment ${installmentNumber}`
                                : "Downpayment"}
                        </div>
                    </div>
                </div>
                <div className="flex flex-col space-y-1 text-xs">
                    <Badge size="sm" variant="secondary" className="shrink-0">
                        {projectName} - Plot No. {plotNumber}
                    </Badge>
                    {formatTzs(computeOutstanding(installment))}
                </div>
            </div>
        </div>
    );
}

/** Hover-tooltip content for a day's grouped installments — a scrollable
 *  vertical list, one row per installment. Rendered inside HoverCardContent
 *  (which already applies p-3), so the ScrollArea reclaims that padding via
 *  negative margin and re-adds it inside itself — the same gutter trick
 *  ReusableTimeline uses — so the scrollbar sits flush at the card's edge. */
function InstallmentCalendarEventTooltip({
                                             occurrence,
                                         }: {
    occurrence: EventCalendarOccurrence<InstallmentCalendarEventData>;
}) {
    const data = occurrence.event.data;
    if (!data) return null;
    return (
        <>
            <p className="pb-2 text-xs font-semibold">
                {data.installments.length}{" "}
                {data.installments.length === 1 ? "installment" : "installments"} due
            </p>
            {/* type="always": the default "hover" type only turns on real
                overflow/wheel-scrolling after the pointer lingers on the
                scroll area long enough for Radix's resize-based detection to
                finish - inside a transient hover tooltip that often never
                settles before someone tries to scroll, so wheel scrolling
                silently does nothing. "always" mounts the scrollbar (and its
                wheel handling) immediately instead of waiting on that. */}
            <ScrollArea type="always" className="-mx-3 -mb-3 h-64 px-3 pb-3">
                {data.installments.map((installment) => (
                    <InstallmentTooltipRow
                        key={installment.id}
                        installment={installment}
                    />
                ))}
            </ScrollArea>
        </>
    );
}

/** Recovery Calendar shown on the Reminder route: installments plotted by
 *  due date via ReusableEventsCalendar, wired up through its generic slots —
 *  a search box (client/project), a "New event" button left hidden (no
 *  onAddEvent supplied — installments aren't created from the calendar),
 *  and range-scoped Outstanding/Overdue totals in the middle of the toolbar. */
export function InstallmentsRecoveryCalendar() {
    const {getToken} = useAuth();
    const api = apiClient(getToken);
    const [searchQuery, setSearchQuery] = useState("");

    const installmentsQuery = useQuery({
        queryKey: ["installments"],
        queryFn: async () => {
            const res = await api.api.installments.$get();
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                const message =
                    (body && typeof body === "object" && "error" in body
                        ? (body as { error?: string }).error
                        : null) ?? `Failed to load installments (${res.status})`;
                throw new Error(message);
            }
            return res.json();
        },
    });

    const data = useMemo(
        () => (installmentsQuery.data ?? []) as unknown as IInstallment[],
        [installmentsQuery.data],
    );

    const filteredData = useMemo(() => {
        const searchLower = searchQuery.toLowerCase();
        if (!searchLower) return data;
        return data.filter((item) => {
            const clientName = item.contract?.client?.fullName ?? "";
            const projectName = item.plot?.project?.projectName ?? "";
            return (
                clientName.toLowerCase().includes(searchLower) ||
                projectName.toLowerCase().includes(searchLower)
            );
        });
    }, [data, searchQuery]);

    const events = useMemo(
        () => buildInstallmentCalendarEvents(filteredData),
        [filteredData],
    );

    return (
        <ReusableEventsCalendar<InstallmentCalendarEventData>
            events={events}
            views={["month", "week", "agenda"]}
            i18n={{viewNames: {agenda: "List View"}}}
            renderEventTooltip={({occurrence}) => (
                <InstallmentCalendarEventTooltip occurrence={occurrence}/>
            )}
            search={{
                value: searchQuery,
                onChange: setSearchQuery,
                placeholder: "Search client or project...",
            }}
            headerCenter={({activeRange, hasChangedView}) => {
                // "All time" until the person actually switches views, then
                // scoped to whatever range the active view is showing.
                const scoped = hasChangedView
                    ? filteredData.filter((item) => {
                        const due = new Date(item.dueDate);
                        return (
                            !Number.isNaN(due.getTime()) &&
                            due >= activeRange.start &&
                            due < activeRange.end
                        );
                    })
                    : filteredData;
                const outstanding = scoped.reduce(
                    (sum, item) => sum + computeOutstanding(item),
                    0,
                );
                const overdue = scoped
                    .filter((item) => computeReminderStatus(item) === "OVERDUE")
                    .reduce((sum, item) => sum + computeOutstanding(item), 0);
                return (
                    <div className="text-muted-foreground flex items-center gap-4 text-xs font-medium">
            <span>
              Outstanding:{" "}
                <span className="text-foreground font-semibold">
                Tshs. {formatCompactAmount(outstanding)}
              </span>
            </span>
                        <span>
              Overdue:{" "}
                            <span className="text-destructive font-semibold">
                Tshs. {formatCompactAmount(overdue)}
              </span>
            </span>
                    </div>
                );
            }}
        />
    );
}