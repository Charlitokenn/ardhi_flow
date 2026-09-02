import {type ReactNode, useRef, useState} from "react"
import {
    EventCalendar,
    type EventCalendarApi,
    type EventCalendarRenderEventProps,
    useEventCalendarNavigation,
    useEventCalendarView,
} from "@/components/reui/event-calendar/event-calendar"
import {EventCalendarContent} from "@/components/reui/event-calendar/event-calendar-content"
import type {EventCalendarI18nOverrides} from "@/components/reui/event-calendar/event-calendar-i18n"
import {EventCalendarNav, EventCalendarToolbar,} from "@/components/reui/event-calendar/event-calendar-nav"
import type {
    CalendarEvent,
    CalendarView,
    EventCalendarDateRange,
    EventCalendarInteractions,
    EventCalendarOccurrence,
    EventCalendarResource,
    EventCalendarSegment,
    EventCalendarViewSettings,
} from "@/components/reui/event-calendar/event-calendar-types"
import {type Locale} from "date-fns"
import {ar, de, es, fr, ja} from "date-fns/locale"

import {Button} from "@/components/ui/button"
import {Card, CardContent} from "@/components/ui/card"
import {InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput,} from "@/components/ui/input-group"
import {Label} from "@/components/ui/label"
import {Popover, PopoverContent, PopoverTrigger,} from "@/components/ui/popover"
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue,} from "@/components/ui/select"
import {Switch} from "@/components/ui/switch"
import {Tabs, TabsContent, TabsList, TabsTrigger,} from "@/components/ui/tabs"
import {PlusIcon, SearchIcon, Settings2Icon, XIcon} from "lucide-react"
import {cn} from "@/lib/utils"

// ============================================================================
// ReusableEventsCalendar — a full-featured month/week/day/agenda calendar
// (built on the reui EventCalendar primitive) with a Settings popover for
// view/time-grid/behavior/region preferences baked in.
//
// This component owns no domain knowledge and ships with zero sample/demo
// data — `events` is required and everything shown (chip content, tooltip
// content, the "add event" button, the search box, the middle-of-toolbar
// summary slot) is either the primitive's own default rendering or supplied
// by the consumer via props. That's what makes it safe to drop into any
// context (a sales pipeline, a delivery schedule, a payment-recovery
// calendar, a team roster) just by shaping data into `CalendarEvent<TData>[]`
// and passing the render props that context needs.
// ============================================================================

/**
 * i18n presets - each language ships a date-fns `locale` (localizes every
 * formatted date: weekday headers, month title, time gutter) plus an `i18n`
 * override map for the static UI strings the locale can't reach (Today, view
 * names, "+N more"). Arabic also flips the whole calendar to right-to-left.
 * English is the built-in default, so it leaves both undefined — a consumer
 * can still override individual English labels via the `i18n` prop, which is
 * merged on top of whichever locale preset is active.
 */
interface CalendarLocalePreset {
    id: string
    /** Native language name, shown in the picker. */
    label: string
    locale: Locale | undefined
    dir: "ltr" | "rtl"
    i18n: EventCalendarI18nOverrides | undefined
}

const LOCALES: CalendarLocalePreset[] = [
    {
        id: "en",
        label: "English",
        locale: undefined,
        dir: "ltr",
        i18n: undefined,
    },
    {
        id: "de",
        label: "Deutsch",
        locale: de,
        dir: "ltr",
        i18n: {
            labels: {
                today: "Heute",
                allDay: "Ganztägig",
                noEvents: "Keine Termine",
                more: (count) => `+${count} weitere`,
            },
            viewNames: {
                month: "Monat",
                week: "Woche",
                day: "Tag",
                days: (count) => `${count} Tage`,
                agenda: "Agenda",
                resource: "Zeitraster",
            },
        },
    },
    {
        id: "fr",
        label: "Français",
        locale: fr,
        dir: "ltr",
        i18n: {
            labels: {
                today: "Aujourd'hui",
                allDay: "Journée entière",
                noEvents: "Aucun événement",
                more: (count) => `+${count} autres`,
            },
            viewNames: {
                month: "Mois",
                week: "Semaine",
                day: "Jour",
                days: (count) => `${count} jours`,
                agenda: "Agenda",
                resource: "Grille horaire",
            },
        },
    },
    {
        id: "es",
        label: "Español",
        locale: es,
        dir: "ltr",
        i18n: {
            labels: {
                today: "Hoy",
                allDay: "Todo el día",
                noEvents: "Sin eventos",
                more: (count) => `+${count} más`,
            },
            viewNames: {
                month: "Mes",
                week: "Semana",
                day: "Día",
                days: (count) => `${count} días`,
                agenda: "Agenda",
                resource: "Cuadrícula",
            },
        },
    },
    {
        id: "ja",
        label: "日本語",
        locale: ja,
        dir: "ltr",
        i18n: {
            labels: {
                today: "今日",
                allDay: "終日",
                noEvents: "予定なし",
                more: (count) => `他${count}件`,
            },
            viewNames: {
                month: "月",
                week: "週",
                day: "日",
                days: (count) => `${count}日間`,
                agenda: "予定",
                resource: "タイムグリッド",
            },
        },
    },
    {
        id: "ar",
        label: "العربية",
        locale: ar,
        dir: "rtl",
        i18n: {
            labels: {
                today: "اليوم",
                allDay: "طوال اليوم",
                noEvents: "لا توجد أحداث",
                more: (count) => `+${count} المزيد`,
            },
            viewNames: {
                month: "شهر",
                week: "أسبوع",
                day: "يوم",
                days: (count) => `${count} أيام`,
                agenda: "جدول الأعمال",
                resource: "شبكة زمنية",
            },
        },
    },
]

/** Display time zones - all event math and rendering happen in the chosen
 *  zone, so switching it visibly shifts every event's clock time. */
const TIME_ZONES: Array<{ id: string; label: string; value?: string }> = [
    {id: "local", label: "Browser"},
    {id: "ny", label: "New York", value: "America/New_York"},
    {id: "london", label: "London", value: "Europe/London"},
    {id: "tokyo", label: "Tokyo", value: "Asia/Tokyo"},
    {id: "kolkata", label: "Kolkata", value: "Asia/Kolkata"},
]

/** Everything the Settings popover drives, as one resettable object. */
interface CalendarPanelSettings {
    viewSettings: EventCalendarViewSettings
    interactions: EventCalendarInteractions
    weekStartsOn: 0 | 1
    dayStartHour: number
    dayEndHour: number
    interval: number
    snapDuration: number
    eventTooltip: boolean
    showDayAddButton: boolean
    localeId: string
    timeZoneId: string
}

const DEFAULT_SETTINGS: CalendarPanelSettings = {
    viewSettings: {
        weekends: true,
        weekNumbers: false,
        nowIndicator: true,
        offDays: false,
    },
    interactions: {drag: true, resize: true, selectSlot: true},
    weekStartsOn: 0,
    dayStartHour: 0,
    dayEndHour: 24,
    interval: 60,
    snapDuration: 15,
    // Tooltips on by default — a consumer relying on renderEventTooltip
    // (e.g. to surface a day's grouped items on hover) wants this visible
    // without an extra click into Settings.
    eventTooltip: true,
    showDayAddButton: false,
    localeId: "en",
    timeZoneId: "local",
}

function SettingsSwitch({
                            id,
                            label,
                            checked,
                            onCheckedChange,
                        }: {
    id: string
    label: string
    checked: boolean
    onCheckedChange: (checked: boolean) => void
}) {
    return (
        <div className="flex items-center justify-between gap-4">
            <Label htmlFor={id} className="font-normal">
                {label}
            </Label>
            <Switch id={id} checked={checked} onCheckedChange={onCheckedChange}/>
        </div>
    )
}

function SettingsSelect({
                            id,
                            label,
                            value,
                            options,
                            onValueChange,
                        }: {
    id: string
    label: string
    value: number
    options: Array<{ value: number; label: string }>
    onValueChange: (value: number) => void
}) {
    return (
        <div className="flex items-center justify-between gap-4">
            <Label htmlFor={id} className="font-normal">
                {label}
            </Label>
            <Select
                value={String(value)}
                onValueChange={(next) => onValueChange(Number(next))}
            >
                <SelectTrigger id={id} size="sm" className="w-28">
                    <SelectValue/>
                </SelectTrigger>
                <SelectContent>
                    {options.map((option) => (
                        <SelectItem key={option.value} value={String(option.value)}>
                            {option.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    )
}

/** String-keyed sibling of SettingsSelect, for the language/time-zone pickers. */
function SettingsTextSelect({
                                id,
                                label,
                                value,
                                options,
                                onValueChange,
                            }: {
    id: string
    label: string
    value: string
    options: Array<{ value: string; label: string }>
    onValueChange: (value: string) => void
}) {
    return (
        <div className="flex items-center justify-between gap-4">
            <Label htmlFor={id} className="font-normal">
                {label}
            </Label>
            <Select value={value} onValueChange={onValueChange}>
                <SelectTrigger id={id} size="sm" className="w-36">
                    <SelectValue/>
                </SelectTrigger>
                <SelectContent>
                    {options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                            {option.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    )
}

/** Pulls the calendar's live view + active date range (only available inside
 *  the <EventCalendar> provider tree) and hands them to the consumer's
 *  `headerCenter` render prop, so the consumer never needs to know about
 *  the primitive's own hooks to show a range-scoped summary. */
function HeaderCenterSlot({
                              headerCenter,
                              hasChangedView,
                          }: {
    headerCenter: (ctx: {
        activeRange: EventCalendarDateRange
        view: CalendarView
        hasChangedView: boolean
    }) => ReactNode
    hasChangedView: boolean
}) {
    const {activeRange} = useEventCalendarNavigation()
    const {view} = useEventCalendarView()
    return <>{headerCenter({activeRange, view, hasChangedView})}</>
}

export interface ReusableEventsCalendarProps<TData = unknown> {
    /** Events to display. This component ships with no sample data of its
     *  own, so nothing renders on the grid until this is supplied. */
    events: CalendarEvent<TData>[]
    /** Bookable resources — passing these unlocks the resource view. Omit
     *  for a calendar with no resource concept. */
    resources?: EventCalendarResource[]
    /** Restricts (and orders) the view switcher, e.g. ["month", "week",
     *  "agenda"]. Omit for every view the calendar ships. */
    views?: CalendarView[]
    defaultView?: CalendarView
    /** Custom chip content. Return undefined for any event to fall back to
     *  the built-in dot + title + time rendering. */
    renderEvent?: (props: EventCalendarRenderEventProps<TData>) => ReactNode
    /** Custom hover-tooltip content (see the "Event tooltips" Behavior
     *  setting — on by default here). Return a falsy value to fall back to
     *  the default title + time tooltip. */
    renderEventTooltip?: (props: {
        occurrence: EventCalendarOccurrence<TData>
        segment: EventCalendarSegment<TData>
        view: CalendarView
        label: string | undefined
    }) => ReactNode
    /** Label overrides merged on top of whichever language is active in the
     *  Settings panel — e.g. {viewNames: {agenda: "List View"}}. */
    i18n?: EventCalendarI18nOverrides
    /** Rendered in the middle of the top bar, between the date/title and the
     *  Settings button. Called with the calendar's live view + active date
     *  range so a consumer can show range-scoped summary numbers (e.g.
     *  totals for whatever month/week is currently visible). */
    headerCenter?: (ctx: {
        activeRange: EventCalendarDateRange
        view: CalendarView
        /** False until the person has manually switched views at least
         *  once — lets a consumer start with an unscoped ("all time")
         *  figure and only switch to range-scoped once there's an explicit
         *  view change to scope from. */
        hasChangedView: boolean
    }) => ReactNode
    /** Controlled search box in the toolbar, right before Settings. Omit to
     *  leave the toolbar without one — this component does no filtering of
     *  `events` itself; the consumer owns what `value`/`onChange` filter. */
    search?: {
        value: string
        onChange: (value: string) => void
        placeholder?: string
    }
    /** "New event" button in the toolbar. Omit to hide it entirely — this
     *  component has no built-in create-event flow, so the button only
     *  appears when the consumer supplies one. */
    onAddEvent?: () => void
    addEventLabel?: string
    className?: string
}

export function ReusableEventsCalendar<TData = unknown>({
                                                            events,
                                                            resources,
                                                            views,
                                                            defaultView = "month",
                                                            renderEvent,
                                                            renderEventTooltip,
                                                            i18n: i18nProp,
                                                            headerCenter,
                                                            search,
                                                            onAddEvent,
                                                            addEventLabel = "New event",
                                                            className,
                                                        }: ReusableEventsCalendarProps<TData>) {
    const apiRef = useRef<EventCalendarApi<TData> | null>(null)
    const [settings, setSettings] = useState<CalendarPanelSettings>(DEFAULT_SETTINGS)
    // Mirror the active view so the settings panel can show the time-grid
    // internals tab only where those options are visible (week/day/N-days and
    // the resource time grid - month and agenda render no hour track), and so
    // headerCenter can tell whether the person has switched views at all.
    const [view, setView] = useState<CalendarView>(defaultView)
    const [hasChangedView, setHasChangedView] = useState(false)
    const isTimeGridView = view !== "month" && view !== "agenda"

    const activeLocale =
        LOCALES.find((entry) => entry.id === settings.localeId) ?? LOCALES[0]
    const activeTimeZone =
        TIME_ZONES.find((entry) => entry.id === settings.timeZoneId) ??
        TIME_ZONES[0]

    // The active locale preset supplies its own view-name/label overrides;
    // a consumer's `i18n` prop is merged on top so e.g. renaming "Agenda" to
    // "List View" doesn't require forking a whole locale preset.
    const mergedI18n: EventCalendarI18nOverrides | undefined =
        activeLocale.i18n || i18nProp
            ? {
                ...activeLocale.i18n,
                ...i18nProp,
                labels: {...activeLocale.i18n?.labels, ...i18nProp?.labels},
                viewNames: {
                    ...activeLocale.i18n?.viewNames,
                    ...i18nProp?.viewNames,
                },
            }
            : undefined

    const patch = (partial: Partial<CalendarPanelSettings>) =>
        setSettings((current) => ({...current, ...partial}))

    const handleViewChange = (next: CalendarView) => {
        setView(next)
        setHasChangedView(true)
    }

    return (
        <div className="w-full p-4" dir={activeLocale.dir}>
            <Card className="w-full py-0">
                <CardContent className="p-0">
                    <EventCalendar
                        events={events}
                        views={views}
                        defaultView={defaultView}
                        onViewChange={handleViewChange}
                        resources={resources}
                        apiRef={apiRef}
                        renderEvent={renderEvent}
                        renderEventTooltip={renderEventTooltip}
                        locale={activeLocale.locale}
                        i18n={mergedI18n}
                        timeZone={activeTimeZone.value}
                        viewSettings={settings.viewSettings}
                        onViewSettingsChange={(viewSettings) => patch({viewSettings})}
                        interactions={settings.interactions}
                        onInteractionsChange={(interactions) => patch({interactions})}
                        weekStartsOn={settings.weekStartsOn}
                        dayStartHour={settings.dayStartHour}
                        dayEndHour={settings.dayEndHour}
                        interval={settings.interval}
                        snapDuration={settings.snapDuration}
                        eventTooltip={settings.eventTooltip}
                        showDayAddButton={settings.showDayAddButton}
                        offDays
                        className={cn("h-[640px] w-full", className)}
                    >
                        <div className="flex flex-wrap items-center gap-2 pe-2">
                            <EventCalendarNav/>
                            <div className="flex min-w-0 flex-1 items-center justify-center">
                                {headerCenter && (
                                    <HeaderCenterSlot
                                        headerCenter={headerCenter}
                                        hasChangedView={hasChangedView}
                                    />
                                )}
                            </div>
                            <EventCalendarToolbar>
                                {search && (
                                    <InputGroup className="w-56">
                                        <InputGroupAddon align="inline-start">
                                            <SearchIcon/>
                                        </InputGroupAddon>
                                        <InputGroupInput
                                            placeholder={search.placeholder ?? "Search..."}
                                            value={search.value}
                                            onChange={(e) => search.onChange(e.target.value)}
                                        />
                                        {search.value.length > 0 && (
                                            <InputGroupAddon align="inline-end">
                                                <InputGroupButton
                                                    aria-label="Clear"
                                                    title="Clear"
                                                    size="icon-xs"
                                                    onClick={() => search.onChange("")}
                                                >
                                                    <XIcon/>
                                                </InputGroupButton>
                                            </InputGroupAddon>
                                        )}
                                    </InputGroup>
                                )}
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" size="sm">
                                            <Settings2Icon className="size-4" aria-hidden="true"/>
                                            Settings
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent align="end" sideOffset={8} className="w-80">
                                        <Tabs defaultValue="view">
                                            <TabsList className="w-full">
                                                <TabsTrigger value="view" className="flex-1">
                                                    View
                                                </TabsTrigger>
                                                {/* time-grid internals only exist where an hour track
                            renders, so the tab follows the active view */}
                                                {isTimeGridView && (
                                                    <TabsTrigger value="time" className="flex-1">
                                                        Time grid
                                                    </TabsTrigger>
                                                )}
                                                <TabsTrigger value="behavior" className="flex-1">
                                                    Behavior
                                                </TabsTrigger>
                                                <TabsTrigger value="region" className="flex-1">
                                                    Region
                                                </TabsTrigger>
                                            </TabsList>
                                            <TabsContent value="view" className="flex flex-col gap-3">
                                                <SettingsSwitch
                                                    id="ec-set-weekends"
                                                    label="Weekends"
                                                    checked={settings.viewSettings.weekends ?? true}
                                                    onCheckedChange={(weekends) =>
                                                        patch({
                                                            viewSettings: {
                                                                ...settings.viewSettings,
                                                                weekends,
                                                            },
                                                        })
                                                    }
                                                />
                                                <SettingsSwitch
                                                    id="ec-set-week-numbers"
                                                    label="Week numbers"
                                                    checked={settings.viewSettings.weekNumbers ?? false}
                                                    onCheckedChange={(weekNumbers) =>
                                                        patch({
                                                            viewSettings: {
                                                                ...settings.viewSettings,
                                                                weekNumbers,
                                                            },
                                                        })
                                                    }
                                                />
                                                <SettingsSwitch
                                                    id="ec-set-now"
                                                    label="Now indicator"
                                                    checked={settings.viewSettings.nowIndicator ?? true}
                                                    onCheckedChange={(nowIndicator) =>
                                                        patch({
                                                            viewSettings: {
                                                                ...settings.viewSettings,
                                                                nowIndicator,
                                                            },
                                                        })
                                                    }
                                                />
                                                <SettingsSwitch
                                                    id="ec-set-off-days"
                                                    label="Mark off days"
                                                    checked={settings.viewSettings.offDays ?? false}
                                                    onCheckedChange={(offDays) =>
                                                        patch({
                                                            viewSettings: {
                                                                ...settings.viewSettings,
                                                                offDays,
                                                            },
                                                        })
                                                    }
                                                />
                                                <SettingsSwitch
                                                    id="ec-set-day-add"
                                                    label="Day add button"
                                                    checked={settings.showDayAddButton}
                                                    onCheckedChange={(showDayAddButton) =>
                                                        patch({showDayAddButton})
                                                    }
                                                />
                                                {/* week start shapes month and week grids alike, so
                            it lives here rather than in time-grid internals */}
                                                <SettingsSelect
                                                    id="ec-set-week-start"
                                                    label="Week starts"
                                                    value={settings.weekStartsOn}
                                                    options={[
                                                        {value: 0, label: "Sunday"},
                                                        {value: 1, label: "Monday"},
                                                    ]}
                                                    onValueChange={(weekStartsOn) =>
                                                        patch({weekStartsOn: weekStartsOn as 0 | 1})
                                                    }
                                                />
                                            </TabsContent>
                                            <TabsContent value="time" className="flex flex-col gap-3">
                                                <SettingsSelect
                                                    id="ec-set-day-start"
                                                    label="Day starts"
                                                    value={settings.dayStartHour}
                                                    options={[
                                                        {value: 0, label: "00:00"},
                                                        {value: 6, label: "06:00"},
                                                        {value: 8, label: "08:00"},
                                                    ]}
                                                    onValueChange={(dayStartHour) =>
                                                        patch({dayStartHour})
                                                    }
                                                />
                                                <SettingsSelect
                                                    id="ec-set-day-end"
                                                    label="Day ends"
                                                    value={settings.dayEndHour}
                                                    options={[
                                                        {value: 18, label: "18:00"},
                                                        {value: 20, label: "20:00"},
                                                        {value: 24, label: "24:00"},
                                                    ]}
                                                    onValueChange={(dayEndHour) => patch({dayEndHour})}
                                                />
                                                <SettingsSelect
                                                    id="ec-set-interval"
                                                    label="Grid interval"
                                                    value={settings.interval}
                                                    options={[
                                                        {value: 30, label: "30 min"},
                                                        {value: 60, label: "60 min"},
                                                    ]}
                                                    onValueChange={(interval) => patch({interval})}
                                                />
                                                <SettingsSelect
                                                    id="ec-set-snap"
                                                    label="Drag snap"
                                                    value={settings.snapDuration}
                                                    options={[
                                                        {value: 5, label: "5 min"},
                                                        {value: 15, label: "15 min"},
                                                        {value: 30, label: "30 min"},
                                                    ]}
                                                    onValueChange={(snapDuration) =>
                                                        patch({snapDuration})
                                                    }
                                                />
                                            </TabsContent>
                                            <TabsContent
                                                value="behavior"
                                                className="flex flex-col gap-3"
                                            >
                                                <SettingsSwitch
                                                    id="ec-set-drag"
                                                    label="Drag to move"
                                                    checked={settings.interactions.drag}
                                                    onCheckedChange={(drag) =>
                                                        patch({
                                                            interactions: {...settings.interactions, drag},
                                                        })
                                                    }
                                                />
                                                <SettingsSwitch
                                                    id="ec-set-resize"
                                                    label="Drag to resize"
                                                    checked={settings.interactions.resize}
                                                    onCheckedChange={(resize) =>
                                                        patch({
                                                            interactions: {
                                                                ...settings.interactions,
                                                                resize,
                                                            },
                                                        })
                                                    }
                                                />
                                                <SettingsSwitch
                                                    id="ec-set-select-slot"
                                                    label="Drag to create"
                                                    checked={settings.interactions.selectSlot}
                                                    onCheckedChange={(selectSlot) =>
                                                        patch({
                                                            interactions: {
                                                                ...settings.interactions,
                                                                selectSlot,
                                                            },
                                                        })
                                                    }
                                                />
                                                <SettingsSwitch
                                                    id="ec-set-tooltip"
                                                    label="Event tooltips"
                                                    checked={settings.eventTooltip}
                                                    onCheckedChange={(eventTooltip) =>
                                                        patch({eventTooltip})
                                                    }
                                                />
                                            </TabsContent>
                                            <TabsContent
                                                value="region"
                                                className="flex flex-col gap-3"
                                            >
                                                <SettingsTextSelect
                                                    id="ec-set-language"
                                                    label="Language"
                                                    value={settings.localeId}
                                                    options={LOCALES.map((entry) => ({
                                                        value: entry.id,
                                                        label: entry.label,
                                                    }))}
                                                    onValueChange={(localeId) => patch({localeId})}
                                                />
                                                <SettingsTextSelect
                                                    id="ec-set-timezone"
                                                    label="Time zone"
                                                    value={settings.timeZoneId}
                                                    options={TIME_ZONES.map((entry) => ({
                                                        value: entry.id,
                                                        label: entry.label,
                                                    }))}
                                                    onValueChange={(timeZoneId) => patch({timeZoneId})}
                                                />
                                                <p className="text-muted-foreground text-xs leading-relaxed">
                                                    Language switches the date-fns locale and every UI
                                                    label. Time zone shifts all event times. Arabic also
                                                    flips the calendar to right-to-left.
                                                </p>
                                            </TabsContent>
                                        </Tabs>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="mt-4 w-full"
                                            onClick={() => setSettings(DEFAULT_SETTINGS)}
                                        >
                                            Reset to defaults
                                        </Button>
                                    </PopoverContent>
                                </Popover>
                                {onAddEvent && (
                                    <Button size="sm" onClick={onAddEvent}>
                                        <PlusIcon className="size-4" aria-hidden="true"/>
                                        {addEventLabel}
                                    </Button>
                                )}
                            </EventCalendarToolbar>
                        </div>
                        <EventCalendarContent/>
                    </EventCalendar>
                </CardContent>
            </Card>
        </div>
    )
}