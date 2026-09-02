"use client"

import {
  useMemo,
  useState,
  type CSSProperties,
  type HTMLAttributes,
} from "react"
import {
  EventCalendarViewContext,
  useEventCalendar,
  useEventCalendarSelector,
  useEventCalendarSettings,
  useEventCalendarViewConfig,
} from "@/components/reui/event-calendar/event-calendar"
import { EventCalendarEvent } from "@/components/reui/event-calendar/event-calendar-event"
import {
  getDayKey,
  getRangeKey,
  toZoned,
  zonedStartOfDay,
} from "@/components/reui/event-calendar/event-calendar-lib"
import type {
  EventCalendarDateRange,
  EventCalendarOccurrence,
  EventCalendarSegment,
} from "@/components/reui/event-calendar/event-calendar-types"
import { IconStack } from "@/components/reui/icon-stack"
import { addDays, format } from "date-fns"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"
import { ScrollArea } from "@/components/ui/scroll-area"
import { CalendarIcon, ChevronDownIcon, ChevronRightIcon } from "lucide-react"

// The agenda window length is the agendaDayCount SETTING (the store derives
// visibleRange from it); a per-view prop here would silently disagree.
interface EventCalendarAgendaViewProps extends HTMLAttributes<HTMLDivElement> {
  asChild?: boolean
}

function EventCalendarAgendaView({
  className,
  asChild = false,
  ...props
}: EventCalendarAgendaViewProps) {
  const instance = useEventCalendar()
  const settings = useEventCalendarSettings()
  const viewConfig = useEventCalendarViewConfig()
  const visibleRange = useEventCalendarSelector<
    unknown,
    EventCalendarDateRange
  >((state) => state.visibleRange, {
    isEqual: (a, b) => getRangeKey(a) === getRangeKey(b),
  })
  // Subscribe to event changes via the day-bucket content of the whole range
  useEventCalendarSelector((state) => state.events)

  const days = useMemo(() => {
    const result: Date[] = []
    let cursor = zonedStartOfDay(visibleRange.start, settings.timeZone)
    while (cursor < visibleRange.end) {
      result.push(cursor)
      cursor = zonedStartOfDay(
        addDays(toZoned(cursor, settings.timeZone), 1),
        settings.timeZone
      )
    }
    return result
  }, [visibleRange, settings.timeZone])

  const index = instance.internals.getIndex()
  const groups = days
    .map((day) => ({
      day,
      bucket: index.byDay.get(getDayKey(day, settings.timeZone)),
    }))
    .filter((group) => {
      const total =
        (group.bucket?.allDay.length ?? 0) + (group.bucket?.timed.length ?? 0)
      return total > 0
    })

  const isToday = (day: Date) =>
    getDayKey(day, settings.timeZone) ===
    getDayKey(new Date(), settings.timeZone)

  const native = viewConfig.scrollbars === "native"

  const body = (
    <>
      {groups.length === 0 ? (
        <div
          data-slot="event-calendar-no-events"
          className={cn(
            "flex min-h-72 flex-col items-center justify-center gap-4 py-16",
            viewConfig.classNames?.noEvents
          )}
        >
          {viewConfig.renderNoEvents?.() ?? (
            <>
              <IconStack>
                <CalendarIcon className="size-5" aria-hidden="true" />
              </IconStack>
              <span className="text-muted-foreground text-sm">
                {settings.i18n.labels.noEvents}
              </span>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col">
          {groups.map(({ day, bucket }) => {
            const items = [...(bucket?.allDay ?? []), ...(bucket?.timed ?? [])]
            return (
              <EventCalendarAgendaDay
                key={day.getTime()}
                day={day}
                items={items}
                isToday={isToday(day)}
                native={native}
              />
            )
          })}
        </div>
      )}
    </>
  )

  const Comp = asChild ? Slot.Root : "div"

  return (
    <EventCalendarViewContext.Provider value={{ view: "agenda" }}>
      <Comp
        data-slot="event-calendar-agenda-view"
        data-view="agenda"
        // Unlike the grid views the agenda has no row/column semantics to carry
        // a name, so label the region with the day range it covers - through
        // formatDayRange, so a consumer override reaches it.
        role="group"
        aria-label={settings.i18n.functions.formatDayRange(visibleRange, {
          locale: settings.locale,
        })}
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-hidden border-t",
          viewConfig.classNames?.agendaView,
          className
        )}
        {...props}
      >
        {native ? (
          <div
            data-slot="scroll-area-viewport"
            data-ec-native-scroll=""
            className="h-full overflow-y-auto"
          >
            {body}
          </div>
        ) : (
          <ScrollArea className="h-full">{body}</ScrollArea>
        )}
      </Comp>
    </EventCalendarViewContext.Provider>
  )
}

function EventCalendarAgendaDay({
  day,
  items,
  isToday,
  native,
}: {
  day: Date
  items: EventCalendarSegment[]
  isToday: boolean
  native: boolean
}) {
  const settings = useEventCalendarSettings()
  const viewConfig = useEventCalendarViewConfig()
  const [collapsed, setCollapsed] = useState(false)
  const zoned = toZoned(day, settings.timeZone)
  const dayLabel = format(zoned, settings.i18n.formats.agendaDayHeader, {
    locale: settings.locale,
  })
  const dayNumber = format(zoned, settings.i18n.formats.agendaDayNumber, {
    locale: settings.locale,
  })
  const weekday = format(zoned, settings.i18n.formats.agendaWeekday, {
    locale: settings.locale,
  })
  const occurrences = Array.from(
    new Map(items.map((item) => [item.occurrence.key, item.occurrence])).values()
  )
  const count = occurrences.length
  const toggle = () => setCollapsed((value) => !value)

  const defaultHeader = (
    <>
      <span
        data-slot="event-calendar-agenda-date"
        className={cn(
          "flex items-baseline gap-2 tabular-nums",
          viewConfig.classNames?.agendaDate
        )}
      >
        <span
          className={cn(
            "text-foreground text-lg font-semibold",
            isToday && "text-primary"
          )}
        >
          {dayNumber}
        </span>
        <span className="text-muted-foreground text-sm font-medium">
          {weekday}
        </span>
      </span>
      <button
        type="button"
        aria-expanded={!collapsed}
        aria-label={settings.i18n.labels.toggleDayEvents(count, !collapsed)}
        onClick={toggle}
        className={cn(
          "text-muted-foreground hover:text-foreground inline-flex size-7 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          viewConfig.classNames?.agendaDayToggle
        )}
      >
        {collapsed ? (
          <ChevronRightIcon className="size-4" aria-hidden="true" />
        ) : (
          <ChevronDownIcon className="size-4" aria-hidden="true" />
        )}
      </button>
    </>
  )
  const header =
    viewConfig.renderAgendaDayHeader?.({
      day,
      collapsed,
      count,
      toggle,
      defaultContent: defaultHeader,
    }) ?? defaultHeader

  return (
    <div
      data-slot="event-calendar-agenda-day"
      data-today={isToday || undefined}
      role="group"
      aria-label={`${dayLabel}, ${settings.i18n.labels.events(count)}`}
      className={viewConfig.classNames?.agendaDay}
    >
      <div
        data-slot="event-calendar-agenda-day-header"
        role="heading"
        aria-level={3}
        className={cn(
          "bg-muted/60 sticky top-0 z-10 border-b px-4 py-2",
          !native && "me-2.5",
          viewConfig.classNames?.agendaDayHeader
        )}
      >
        <span className="sr-only">{dayLabel}</span>
        <div
          data-slot="event-calendar-agenda-day-gutter"
          className={cn(
            "flex items-center justify-between gap-4",
            viewConfig.classNames?.agendaDayGutter
          )}
        >
          {header}
        </div>
      </div>
      {collapsed ? (
        <EventCalendarAgendaDaySummary
          day={day}
          occurrences={occurrences}
          expand={() => setCollapsed(false)}
        />
      ) : (
        <div
          data-slot="event-calendar-agenda-day-content"
          className={viewConfig.classNames?.agendaDayContent}
        >
          {items.map((segment) => (
            <EventCalendarAgendaItem
              key={segment.occurrence.key}
              segment={segment}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function EventCalendarAgendaDaySummary({
  day,
  occurrences,
  expand,
}: {
  day: Date
  occurrences: EventCalendarOccurrence[]
  expand: () => void
}) {
  const settings = useEventCalendarSettings()
  const viewConfig = useEventCalendarViewConfig()
  const maxDots = Math.max(0, Math.floor(viewConfig.agendaSummaryMaxDots))
  const shown = occurrences.slice(0, maxDots)
  const remaining = occurrences.length - shown.length
  const defaultContent = (
    <button
      type="button"
      onClick={expand}
      className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-start outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <span className="flex items-center gap-1" aria-hidden="true">
        {shown.map((occurrence) => (
          <span
            key={occurrence.key}
            className={cn(
              "size-2 rounded-full bg-(--ec-event-color)",
              viewConfig.classNames?.agendaSummaryDot
            )}
            style={
              {
                "--ec-event-color":
                  occurrence.event.color ?? "var(--color-primary)",
              } as CSSProperties
            }
          />
        ))}
        {remaining > 0 && (
          <span className="text-muted-foreground ms-1 text-xs">
            {settings.i18n.labels.moreCompact(remaining)}
          </span>
        )}
      </span>
      <span className="text-muted-foreground text-sm">
        {settings.i18n.labels.events(occurrences.length)}
      </span>
    </button>
  )
  const content =
    viewConfig.renderAgendaDaySummary?.({
      day,
      occurrences,
      count: occurrences.length,
      expand,
      defaultContent,
    }) ?? defaultContent

  return (
    <div
      data-slot="event-calendar-agenda-day-summary"
      className={cn(
        "border-b",
        viewConfig.classNames?.agendaDaySummary
      )}
    >
      {content}
    </div>
  )
}

/**
 * One agenda row: a full-width, selectable table row - time column, color dot,
 * and title (all replaceable via renderAgendaEvent). Clicking selects the
 * event (drag/resize stay off in the agenda).
 */
function EventCalendarAgendaItem({
  segment,
}: {
  segment: EventCalendarSegment
}) {
  const settings = useEventCalendarSettings()
  const viewConfig = useEventCalendarViewConfig()
  const [expanded, setExpanded] = useState(false)
  const details = viewConfig.renderAgendaEventDetails?.(segment.occurrence)
  const hasDetails =
    details !== null && details !== undefined && details !== false

  return (
    <div
      data-slot="event-calendar-agenda-item"
      className={cn(
        "border-b",
        viewConfig.classNames?.agendaItem
      )}
    >
      <div
        data-slot="event-calendar-agenda-item-surface"
        className={cn(
          "hover:bg-accent/40 flex items-center transition-colors",
          viewConfig.classNames?.agendaItemSurface
        )}
      >
        <EventCalendarEvent
          segment={segment}
          className="min-w-0 flex-1 gap-3 rounded-none px-4 py-2.5 hover:bg-transparent"
        />
        {hasDetails && (
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={settings.i18n.labels.eventDetails(
              segment.occurrence.event.title
            )}
            onClick={() => setExpanded((value) => !value)}
            className={cn(
              "text-muted-foreground hover:text-foreground me-2 inline-flex size-7 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              viewConfig.classNames?.agendaItemToggle
            )}
          >
            {expanded ? (
              <ChevronDownIcon className="size-4" aria-hidden="true" />
            ) : (
              <ChevronRightIcon className="size-4" aria-hidden="true" />
            )}
          </button>
        )}
      </div>
      {hasDetails && expanded && (
        <div
          data-slot="event-calendar-agenda-event-details"
          className="bg-muted/20 border-t px-4 py-3 text-sm"
        >
          {details}
        </div>
      )}
    </div>
  )
}

export { EventCalendarAgendaView }
export type { EventCalendarAgendaViewProps }
