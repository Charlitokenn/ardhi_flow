"use client";

import type {ReactNode} from "react";
import {
    Timeline,
    TimelineContent,
    TimelineHeader,
    TimelineIndicator,
    TimelineItem,
    TimelineSeparator,
    TimelineTitle,
} from "@/components/reui/timeline";
import {ScrollArea} from "@/components/ui/scroll-area";
import {cn} from "@/lib/utils";

// ============================================================================
// ReusableTimeline — a vertical timeline built on the reui Timeline primitive
// (@/components/reui/timeline): a numbered indicator + title per step, with
// arbitrary content underneath, all inside a single scroll area.
//
// Steps are numbered by their position in `items`, counting DOWN from
// `items.length` — so item 0 gets the highest number, the last item gets 1.
// That's the shape a "latest first" feed (comments, activity, audit trails)
// naturally wants: the newest entry reads as the highest number, the oldest
// as 1. Pass a per-item `indicator` to override the number with something
// else (an icon, a status glyph, an avatar) for feeds that aren't about a
// decreasing count.
//
// This component owns no domain knowledge and ships with zero sample/static
// data — everything rendered comes from `items` and the optional `topSlot`.
// That's what makes it safe to drop into any context (comment threads,
// changelogs, audit trails, build pipelines, etc.) just by shaping data into
// `ReusableTimelineItem[]`.
// ============================================================================

export interface ReusableTimelineItem {
    /** Stable, unique id for this item/step. */
    id: string;
    /** Rendered as the step's title, e.g. a formatted date. */
    title: ReactNode;
    /** Rendered below the title as the step's body. */
    content: ReactNode;
    /** Overrides the indicator's default position-based number with custom
     *  content (an icon, a status glyph, an avatar, etc). */
    indicator?: ReactNode;
}

export interface ReusableTimelineProps {
    items: ReusableTimelineItem[];
    /** Shown in place of the timeline when `items` is empty. `topSlot` is
     *  NOT auto-included here — compose it into your own `emptyState` if a
     *  trigger should still show with zero items. */
    emptyState?: ReactNode;
    /** Rendered above the first step, inside the same scroll area — e.g. an
     *  "add new" affordance for the feed. */
    topSlot?: ReactNode;
    /** Outer wrapper classes (the scrollable content column). */
    className?: string;
    /** Classes for the <ScrollArea> wrapping the whole timeline. Defaults to
     *  filling the height of whatever bounded-height parent it's placed in
     *  (a sheet body, a card, etc) — pass a fixed height (e.g. "h-110")
     *  instead when there's no such parent. */
    scrollAreaClassName?: string;
    /** Classes applied to each <TimelineItem>. */
    itemClassName?: string;
    /** Classes applied to each <TimelineIndicator>. */
    indicatorClassName?: string;
    /** Classes applied to each <TimelineTitle>. */
    titleClassName?: string;
}

export default function ReusableTimeline({
                                             items,
                                             emptyState = null,
                                             topSlot,
                                             className,
                                             scrollAreaClassName = "h-full",
                                             itemClassName,
                                             indicatorClassName,
                                             titleClassName,
                                         }: ReusableTimelineProps) {
    if (!items.length) return <>{emptyState}</>;

    return (
        // ps-4: the reui TimelineIndicator is absolutely positioned to the
        // *left* of each item (-left-7, then -translate-x-1/2), which puts
        // its left edge a few px outside the timeline's own box — fine in
        // open page flow, but ScrollArea clips anything past its edge, so
        // without this gutter the leftmost indicator gets visibly clipped.
        <ScrollArea className={cn("-me-5 ps-4 pe-5", scrollAreaClassName)}>
            <div className={cn("w-full", className)}>
                {topSlot && <div className="ms-8 mb-6">{topSlot}</div>}
                <Timeline defaultValue={items.length}>
                    {items.map((item, index) => {
                        const step = items.length - index;
                        return (
                            <TimelineItem
                                key={item.id}
                                step={step}
                                className={cn("pb-6", itemClassName)}
                            >
                                <TimelineHeader>
                                    <TimelineSeparator
                                        className="group-data-[orientation=vertical]/timeline:-left-7 group-data-[orientation=vertical]/timeline:h-[calc(100%-1.5rem-0.25rem)] group-data-[orientation=vertical]/timeline:translate-y-7"/>
                                    <TimelineTitle
                                        className={cn("text-sm font-semibold", titleClassName)}
                                    >
                                        {item.title}
                                    </TimelineTitle>
                                    <TimelineIndicator
                                        className={cn(
                                            "bg-muted text-muted-foreground group-data-completed/timeline-item:bg-primary group-data-completed/timeline-item:text-primary-foreground flex size-6 items-center justify-center border-none text-[11px] font-medium group-data-[orientation=vertical]/timeline:-left-7",
                                            indicatorClassName,
                                        )}
                                    >
                                        {item.indicator ?? step}
                                    </TimelineIndicator>
                                </TimelineHeader>
                                <TimelineContent className="mt-2">
                                    {item.content}
                                </TimelineContent>
                            </TimelineItem>
                        );
                    })}
                </Timeline>
            </div>
        </ScrollArea>
    );
}

// Example usage:
/*
import ReusableTimeline from "./reusable-timeline";

const items = comments.map((comment) => ({
  id: comment.id,
  title: formatDateTimeShort(comment.createdAt),
  content: (
    <div className="rounded-md border p-2.5 text-sm">
      <p>Comment By: {comment.createdBy ?? "ArdhiFlow System"}</p>
      <p className="mt-1">Comment Details: {comment.message}</p>
    </div>
  ),
}));

function App() {
  return (
    <ReusableTimeline
      items={items}
      topSlot={<AddCommentTrigger onSubmit={...} isPending={false} />}
      emptyState={<AddCommentTrigger onSubmit={...} isPending={false} />}
    />
  );
}
*/