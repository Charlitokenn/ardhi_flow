import { addDays, format } from "date-fns"
import { CalendarIcon } from "lucide-react"
import { type DateRange } from "react-day-picker"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Field, FieldLabel } from "@/components/ui/field"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import {cn} from "@/lib/utils.ts";
import {useState} from "react";

type DateRangePickerProps = {
    label?: string
    showLabel?: boolean
    className?: string
    value?: DateRange
    onChange?: (range: DateRange | undefined) => void
}

export function DateRangePicker({
                                    label,
                                    showLabel = true,
                                    className,
                                    value,
                                    onChange,
                                }: DateRangePickerProps) {
    const [internalDate, setInternalDate] = useState<DateRange | undefined>({
        from: new Date(new Date().getFullYear(), 0, 20),
        to: addDays(new Date(new Date().getFullYear(), 0, 20), 20),
    })

    const date = value ?? internalDate

    const handleSelect = (range: DateRange | undefined) => {
        setInternalDate(range)
        onChange?.(range)
    }

    return (
        <Field className={cn("w-48",className)}>
            {showLabel && (
                <FieldLabel htmlFor="date-picker-range">
                    {label}
                </FieldLabel>
            )}

            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        id="date-picker-range"
                        className="justify-start px-2.5 font-normal"
                    >
                        <CalendarIcon />

                        {date?.from ? (
                            date.to ? (
                                <>
                                    {format(date.from, "LLL dd, y")} -{" "}
                                    {format(date.to, "LLL dd, y")}
                                </>
                            ) : (
                                format(date.from, "LLL dd, y")
                            )
                        ) : (
                            <span>Pick a date</span>
                        )}
                    </Button>
                </PopoverTrigger>

                <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                        mode="range"
                        defaultMonth={date?.from}
                        selected={date}
                        onSelect={handleSelect}
                        numberOfMonths={2}
                    />
                </PopoverContent>
            </Popover>
        </Field>
    )
}