// components/ui/date-range-picker.tsx
import { useCallback, useId, useMemo, useState } from "react"
import { format } from "date-fns"
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
import { cn } from "@/lib/utils"

type DateRangePickerProps = {
    label?: string
    showLabel?: boolean
    className?: string
    value?: DateRange
    defaultValue?: DateRange
    onChange?: (range: DateRange | undefined) => void
    disabled?: boolean
    placeholder?: string
    align?: "start" | "center" | "end"
    numberOfMonths?: number
}

export function DateRangePicker({
                                    label,
                                    showLabel = true,
                                    className,
                                    value,
                                    defaultValue,
                                    onChange,
                                    disabled = false,
                                    placeholder = "Pick a date range",
                                    align = "start",
                                    numberOfMonths = 2,
                                }: DateRangePickerProps) {
    const isControlled = value !== undefined
    const [internalDate, setInternalDate] = useState<DateRange | undefined>(
        defaultValue
    )

    const date = isControlled ? value : internalDate
    const triggerId = useId()

    const handleSelect = useCallback(
        (range: DateRange | undefined) => {
            if (!isControlled) setInternalDate(range)
            onChange?.(range)
        },
        [isControlled, onChange]
    )

    const handleClear = useCallback(() => {
        if (!isControlled) setInternalDate(undefined)
        onChange?.(undefined)
    }, [isControlled, onChange])

    const displayText = useMemo(() => {
        if (!date?.from) return placeholder
        if (date.to) {
            return `${format(date.from, "LLL dd, y")} - ${format(date.to, "LLL dd, y")}`
        }
        return format(date.from, "LLL dd, y")
    }, [date, placeholder])

    const hasValue = !!date?.from

    return (
        <Field className={cn("w-auto min-w-65", className)}>
            {showLabel && label && (
                <FieldLabel htmlFor={triggerId}>{label}</FieldLabel>
            )}

            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        type="button"
                        variant="outline"
                        id={triggerId}
                        disabled={disabled}
                        className={cn(
                            "justify-start px-2.5 font-normal w-full gap-2",
                            !hasValue && "text-muted-foreground"
                        )}
                    >
                        <CalendarIcon className="size-4 shrink-0" />
                        <span className="truncate">{displayText}</span>
                    </Button>
                </PopoverTrigger>

                <PopoverContent className="w-auto p-0" align={align}>
                    <Calendar
                        mode="range"
                        defaultMonth={date?.from}
                        selected={date}
                        onSelect={handleSelect}
                        numberOfMonths={numberOfMonths}
                        disabled={disabled}
                    />
                    {hasValue && (
                        <div className="border-t p-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="w-full text-xs"
                                onClick={handleClear}
                            >
                                Clear range
                            </Button>
                        </div>
                    )}
                </PopoverContent>
            </Popover>
        </Field>
    )
}