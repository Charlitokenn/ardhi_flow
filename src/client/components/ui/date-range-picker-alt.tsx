"use client"

import { useId, useState } from "react"
import {
    addDays,
    endOfMonth,
    endOfYear,
    format,
    startOfMonth,
    startOfYear,
    subDays,
    subMonths,
    subYears,
} from "date-fns"
import type { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent } from "@/components/ui/card"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { CalendarIcon } from "lucide-react"

type DateRangePickerProps = {
    value?: DateRange
    onChange?: (range: DateRange | undefined) => void
}

export function DateRangePickerAlt({
                                       value,
                                       onChange,
                                   }: DateRangePickerProps) {
    const id = useId()
    const today = new Date()

    const yesterday = {
        from: subDays(today, 1),
        to: subDays(today, 1),
    }

    const last7Days = {
        from: subDays(today, 6),
        to: today,
    }

    const last30Days = {
        from: subDays(today, 29),
        to: today,
    }

    const monthToDate = {
        from: startOfMonth(today),
        to: today,
    }

    const lastMonth = {
        from: startOfMonth(subMonths(today, 1)),
        to: endOfMonth(subMonths(today, 1)),
    }

    const yearToDate = {
        from: startOfYear(today),
        to: today,
    }

    const lastYear = {
        from: startOfYear(subYears(today, 1)),
        to: endOfYear(subYears(today, 1)),
    }

    const [month, setMonth] = useState(today)

    const [internalDate, setInternalDate] =
        useState<DateRange | undefined>({
            from: new Date(new Date().getFullYear(), 0, 20),
            to: addDays(
                new Date(new Date().getFullYear(), 0, 20),
                20
            ),
        })

    const date = value ?? internalDate

    const handleSelect = (range: DateRange | undefined) => {
        setInternalDate(range)
        onChange?.(range)
    }

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    className="group/pick-date w-48 justify-between"
                    id={id}
                    variant="outline"
                >
          <span
              className={cn(
                  "truncate",
                  date && "text-foreground"
              )}
          >
            {date?.from
                ? date.to
                    ? `${format(
                        date.from,
                        "LLL dd, y"
                    )} - ${format(
                        date.to,
                        "LLL dd, y"
                    )}`
                    : format(date.from, "LLL dd, y")
                : "Pick a date range"}
          </span>

                    <CalendarIcon
                        aria-hidden="true"
                        className="shrink-0 text-foreground/80 transition-colors group-hover:text-foreground"
                    />
                </Button>
            </PopoverTrigger>

            <PopoverContent
                align="start"
                className="w-auto p-0"
            >
                <Card className="p-0">
                    <CardContent className="p-0">
                        <div className="flex max-sm:flex-col">
                            <div className="relative py-4 max-sm:order-1 max-sm:border-t sm:w-32">
                                <div className="h-full sm:border-e">
                                    <div className="flex flex-col px-2">
                                        <Button
                                            className="w-full justify-start"
                                            onClick={() => {
                                                handleSelect({
                                                    from: today,
                                                    to: today,
                                                })
                                                setMonth(today)
                                            }}
                                            size="sm"
                                            variant="ghost"
                                        >
                                            Today
                                        </Button>
                                        <Button
                                            className="w-full justify-start"
                                            onClick={() => {
                                                handleSelect(yesterday)
                                                setMonth(yesterday.to)
                                            }}
                                            size="sm"
                                            variant="ghost"
                                        >
                                            Yesterday
                                        </Button>
                                        <Button
                                            className="w-full justify-start"
                                            onClick={() => {
                                                handleSelect(last7Days)
                                                setMonth(last7Days.to)
                                            }}
                                            size="sm"
                                            variant="ghost"
                                        >
                                            Last 7 days
                                        </Button>
                                        <Button
                                            className="w-full justify-start"
                                            onClick={() => {
                                                handleSelect(last30Days)
                                                setMonth(last30Days.to)
                                            }}
                                            size="sm"
                                            variant="ghost"
                                        >
                                            Last 30 days
                                        </Button>
                                        <Button
                                            className="w-full justify-start"
                                            onClick={() => {
                                                handleSelect(monthToDate)
                                                setMonth(monthToDate.to)
                                            }}
                                            size="sm"
                                            variant="ghost"
                                        >
                                            Month to date
                                        </Button>
                                        <Button
                                            className="w-full justify-start"
                                            onClick={() => {
                                                handleSelect(lastMonth)
                                                setMonth(lastMonth.to)
                                            }}
                                            size="sm"
                                            variant="ghost"
                                        >
                                            Last month
                                        </Button>
                                        <Button
                                            className="w-full justify-start"
                                            onClick={() => {
                                                handleSelect(yearToDate)
                                                setMonth(yearToDate.to)
                                            }}
                                            size="sm"
                                            variant="ghost"
                                        >
                                            Year to date
                                        </Button>
                                        <Button
                                            className="w-full justify-start"
                                            onClick={() => {
                                                handleSelect(lastYear)
                                                setMonth(lastYear.to)
                                            }}
                                            size="sm"
                                            variant="ghost"
                                        >
                                            Last year
                                        </Button>
                                    </div>
                                </div>
                            </div>
                            <Calendar
                                disabled={[{ after: today }]}
                                mode="range"
                                month={month}
                                onMonthChange={setMonth}
                                onSelect={handleSelect}
                                selected={date}
                            />
                        </div>
                    </CardContent>
                </Card>
            </PopoverContent>
        </Popover>
    )
}