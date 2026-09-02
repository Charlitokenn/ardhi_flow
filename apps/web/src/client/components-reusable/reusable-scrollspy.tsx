"use client";

import {type ReactNode, useRef} from "react";
import {Scrollspy} from "@/components/reui/scrollspy";
import {Button} from "@/components/ui/button";
import {ScrollArea} from "@/components/ui/scroll-area";
import {cn} from "@/lib/utils";

// ============================================================================
// ReusableScrollspy — a two-pane "spy" list built on the reui Scrollspy
// primitive (@/components/reui/scrollspy): a nav column of short labels on
// one side, and a taller scrollable content column on the other. As the
// content is scrolled, whichever section is nearest the top is highlighted
// in the nav; clicking a nav label scrolls its section into view.
//
// This component owns no domain knowledge and ships with zero sample/static
// data — everything rendered comes from `items`. That's what makes it safe
// to drop into any context (comment threads, changelogs, timelines, doc
// sections, etc.) just by shaping data into `ReusableScrollspyItem[]`.
// ============================================================================

export interface ReusableScrollspyItem {
    /** Stable, unique id for this item. Doubles as the DOM id of its content
     *  section, so it must be unique across the whole page while this is
     *  mounted — comment/record ids are a safe choice. */
    id: string;
    /** Rendered in the nav column, e.g. a formatted date/timestamp. */
    label: ReactNode;
    /** Rendered in the main scrollable column for this item. */
    content: ReactNode;
}

export interface ReusableScrollspyProps {
    items: ReusableScrollspyItem[];
    /** Shown in place of the two panes when `items` is empty. */
    emptyState?: ReactNode;
    /** Outer wrapper classes (the flex row holding nav + content). */
    className?: string;
    /** Classes for the nav column's width — defaults to a compact fixed
     *  width that fits short date labels. */
    navWidthClassName?: string;
    /** Classes for the nav's <Scrollspy> wrapper. */
    navClassName?: string;
    /** Classes applied to each nav item button (merged with the built-in
     *  active-state styling). */
    navItemClassName?: string;
    /** Classes for the content column's ScrollArea — controls the visible
     *  height. Defaults to a sheet-friendly height. */
    scrollAreaClassName?: string;
    /** Classes applied to the wrapper around each content section. */
    contentClassName?: string;
    /** Pixels to offset the "active" boundary and scroll-to target by —
     *  useful if the content column has a sticky header of its own. */
    offset?: number;
}

export default function ReusableScrollspy({
                                              items,
                                              emptyState = null,
                                              className,
                                              navWidthClassName = "w-[150px]",
                                              navClassName,
                                              navItemClassName,
                                              scrollAreaClassName = "h-[420px]",
                                              contentClassName,
                                              offset = 12,
                                          }: ReusableScrollspyProps) {
    const parentRef = useRef<HTMLDivElement | null>(null);

    if (!items.length) return <>{emptyState}</>;

    return (
        <div className={cn("flex w-full grow gap-5", className)}>
            <div className={cn("flex shrink-0 flex-col gap-2", navWidthClassName)}>
                {/* history=false: this nav lives inside transient UI (e.g. a
                    sheet), so it shouldn't rewrite the page's URL hash as the
                    user scrolls through it. */}
                <Scrollspy
                    offset={offset}
                    targetRef={parentRef}
                    history={false}
                    className={cn("flex flex-col gap-2.5", navClassName)}
                >
                    {items.map((item) => (
                        <Button
                            key={item.id}
                            type="button"
                            variant="outline"
                            data-scrollspy-anchor={item.id}
                            className={cn(
                                "h-auto w-full justify-start whitespace-normal text-start text-xs data-[active=true]:bg-primary data-[active=true]:text-primary-foreground",
                                navItemClassName,
                            )}
                        >
                            {item.label}
                        </Button>
                    ))}
                </Scrollspy>
            </div>
            <div className="min-w-0 grow" ref={parentRef}>
                <ScrollArea className={cn("-me-5 grow pe-5", scrollAreaClassName)}>
                    <div className={cn("space-y-3", contentClassName)}>
                        {items.map((item) => (
                            <div key={item.id} id={item.id}>
                                {item.content}
                            </div>
                        ))}
                    </div>
                </ScrollArea>
            </div>
        </div>
    );
}

// Example usage:
/*
import ReusableScrollspy from "./reusable-scrollspy";

const items = comments.map((comment) => ({
  id: comment.id,
  label: formatDateTimeShort(comment.createdAt),
  content: (
    <div className="rounded-md border p-2.5 text-sm">
      <p>Comment By: {comment.createdBy ?? "ArdhiFlow System"}</p>
      <p className="mt-1">Comment Details: {comment.message}</p>
    </div>
  ),
}));

function App() {
  return <ReusableScrollspy items={items} />;
}
*/