import { createFileRoute } from '@tanstack/react-router'
import {PageHero} from "@/components/pageHero.tsx";
import {useUser} from "@clerk/react";
import {getGreeting} from "@/lib/utils.ts";
import ReusableStats from "@/components-reusable/reusable-stats.tsx";
import {toast} from "sonner";
import {useState} from "react";
import type {DateRange} from "react-day-picker";
import {DateRangePickerAlt} from "@/components/ui/date-range-picker-alt.tsx";
import {DataTablePattern} from "@/components/data-grids/datagrid-template.tsx";

export const Route = createFileRoute('/_authed/_org/dashboard/')({
    staticData: {
        breadcrumb: 'Dashboard',
    },
    component: DashboardHome,
})

function DashboardHome() {
    const { user } = useUser()
    const greeting = getGreeting()
    const [dateRange, setDateRange] = useState<DateRange | undefined>()

    const handleDateChange = (range: DateRange | undefined) => {
        setDateRange(range)

        if (range?.from && range?.to) {
            // loadSales(range.from, range.to)
            // loadReceivables(range.from, range.to)
            // loadExpenses(range.from, range.to)
            toast("Range Selected")
        }
    }

    return (
        <section className="-mt-4 -ml-1">
            <PageHero
                type="greeting"
                title={greeting + user?.firstName + ","}
                subtitle="Here's the sales performance, cash collections, and receivables overview"
            />
            <div className="flex justify-end w-full mt-4">
                <DateRangePickerAlt value={dateRange} onChange={handleDateChange} />
            </div>
            <div className="grid grid-cols-4 gap-4 mt-4">
                <ReusableStats label="KPI" value="12%"/>
                <ReusableStats label="KPI" value="12%"/>
                <ReusableStats label="KPI" value="12%"/>
                <ReusableStats label="KPI" value="12%"/>
            </div>
            <DataTablePattern/>
        </section>

    )
}
