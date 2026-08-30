import type { ReactNode } from "react"
import {
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from "@/components/ui/empty"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface ReusableEmptyProps {
    /** Illustration/icon shown above the title. Defaults to `StackedCardsIllustration`. Pass `null` to hide it. */
    media?: ReactNode
    title?: string
    description?: string
    /** Primary action label. Omit (along with `onAction`) to hide the button entirely. */
    buttonText?: string
    onAction?: () => void
    /** Secondary, less prominent action rendered next to the primary one. */
    secondaryButtonText?: string
    onSecondaryAction?: () => void
    className?: string
    /** Extra content rendered below the description and above the action buttons (e.g. a search input). */
    children?: ReactNode
}

/**
 * ============================================================================
 * REUSABLE EMPTY STATE
 * ============================================================================
 * Generic "no data" / "no results" placeholder built on top of the `Empty`
 * primitives (`@/components/ui/empty`). Meant to be used both as a
 * standalone empty state and as the `emptyMessage` prop of the `reui`
 * `DataGrid` component, e.g.:
 *
 *   <DataGrid
 *     table={table}
 *     recordCount={data.length}
 *     emptyMessage={
 *       <ReusableEmpty
 *         title="No users found"
 *         description="Try adjusting your filters or search query."
 *         buttonText="Clear filters"
 *         onAction={handleClearFilters}
 *       />
 *     }
 *   >
 *     ...
 *   </DataGrid>
 *
 * `DataGridTableEmpty` renders `emptyMessage` inside a single spanning
 * `<td>`, so this component intentionally stays compact (no fixed height)
 * and centers itself instead of assuming a full-page layout.
 *
 * Everything is optional except sensible defaults for `title`/`description`
 * — swap `media` for `SearchCardsIllustration` (also exported below) when
 * the empty state is caused by a search/filter rather than a true "no data
 * at all" case, or pass your own icon/illustration.
 * ============================================================================
 */
export function ReusableEmpty({
    media = <StackedCardsIllustration />,
    title = "No results found",
    description = "There is no data to display yet.",
    buttonText,
    onAction,
    secondaryButtonText,
    onSecondaryAction,
    className,
    children,
}: ReusableEmptyProps) {
    const hasActions = Boolean(buttonText || secondaryButtonText || children)

    return (
        <div className={cn("flex w-full items-center justify-center p-4", className)}>
            <Empty className="py-12">
                <EmptyHeader>
                    {media && <EmptyMedia>{media}</EmptyMedia>}
                    {title && <EmptyTitle>{title}</EmptyTitle>}
                    {description && <EmptyDescription>{description}</EmptyDescription>}
                </EmptyHeader>

                {hasActions && (
                    <EmptyContent>
                        {children}

                        {(buttonText || secondaryButtonText) && (
                            <div className="flex items-center gap-2">
                                {secondaryButtonText && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={onSecondaryAction}
                                    >
                                        {secondaryButtonText}
                                    </Button>
                                )}
                                {buttonText && (
                                    <Button size="sm" onClick={onAction}>
                                        {buttonText}
                                    </Button>
                                )}
                            </div>
                        )}
                    </EmptyContent>
                )}
            </Empty>
        </div>
    )
}

// Exported so consumers can pick whichever illustration fits their empty
// state (or pass a completely custom `media`).
export const StackedCardsIllustration = () => {
    return (
        <div className="relative h-24 w-52" aria-hidden="true">
            {/* Back card */}
            <div className="bg-muted/60 border-border/50 absolute inset-x-6 top-0 h-6 rounded-t-lg border" />
            {/* Middle card */}
            <div className="bg-muted/80 border-border/60 absolute inset-x-3 top-3 h-6 rounded-t-lg border" />
            {/* Front card */}
            <div className="bg-background border-border absolute inset-x-0 top-6 flex h-16 items-center gap-3 rounded-lg border px-4 shadow-sm">
                <div className="bg-muted size-8 shrink-0 rounded" />
                <div className="flex flex-1 flex-col gap-1.5">
                    <div className="bg-muted h-2.5 w-3/4 rounded" />
                    <div className="bg-muted/60 h-2 w-1/2 rounded" />
                </div>
            </div>
            {/* Fade overlay */}
            <div className="from-background/0 via-background/60 to-background pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-linear-to-b" />
        </div>
    )
}

// Use this instead of `StackedCardsIllustration` when the empty state is the
// result of a search/filter query returning nothing (as opposed to there
// being no data at all).
export const SearchCardsIllustration = () => {
    return (
        <div className="relative h-32 w-56" aria-hidden="true">
            {/* Bottom card */}
            <div className="bg-muted/50 border-border/40 absolute right-6 bottom-4 left-6 flex h-12 items-center gap-2.5 rounded-lg border px-3">
                <div className="bg-muted-foreground/10 size-5 shrink-0 rounded" />
                <div className="flex flex-1 flex-col gap-1">
                    <div className="bg-muted-foreground/10 h-2 w-full rounded" />
                    <div className="bg-muted-foreground/8 h-2 w-2/3 rounded" />
                </div>
            </div>
            {/* Middle card */}
            <div className="bg-muted/70 border-border/50 absolute right-3 bottom-8 left-3 flex h-12 items-center gap-2.5 rounded-lg border px-3">
                <div className="bg-muted-foreground/12 size-5 shrink-0 rounded" />
                <div className="flex flex-1 flex-col gap-1">
                    <div className="bg-muted-foreground/12 h-2 w-full rounded" />
                    <div className="bg-muted-foreground/10 h-2 w-3/4 rounded" />
                </div>
            </div>
            {/* Front card */}
            <div className="bg-background border-border absolute inset-x-0 bottom-12 flex h-14 items-center gap-3 rounded-lg border px-3.5 shadow-sm">
                <div className="bg-muted size-7 shrink-0 rounded" />
                <div className="flex flex-1 flex-col gap-1.5">
                    <div className="bg-muted h-2.5 w-full rounded" />
                    <div className="bg-muted/70 h-2 w-3/5 rounded" />
                </div>
            </div>
            {/* Fade */}
            <div className="from-background/0 to-background pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-linear-to-b" />
        </div>
    )
}
