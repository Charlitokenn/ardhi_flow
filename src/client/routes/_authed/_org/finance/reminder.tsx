import {createFileRoute} from '@tanstack/react-router'
import {PageHero} from "@/components/pageHero.tsx";
import {BellRingIcon, MessagesSquareIcon} from "lucide-react";
import {InstallmentsReminderDataGrid} from "@/components/data-grids/installments-reminder-datagrid.tsx";
import {Button} from "@/components/ui/button.tsx";
import {ReusableSheet} from "@/components-reusable/reusable-sheet.tsx"

export const Route = createFileRoute('/_authed/_org/finance/reminder')({
    staticData: {
        breadcrumb: 'Reminder',
    },
    component: RouteComponent,
})

function RouteComponent() {
    return (
        <section className="-mt-4 -ml-1">
            <div className="flex justify-between items-center">
                <PageHero
                    type="hero"
                    title="Reminder"
                    subtitle="Followup on outstanding payments"
                    buttonIcon={<BellRingIcon/>}
                />
                <ReusableSheet
                    title="Message Broadcasting"
                    trigger={
                        <Button variant="outline">
                            <MessagesSquareIcon className="size-4"/> Message Broadcast
                        </Button>
                    }
                    widthClassName="sm:max-w-full"
                    children={<div/>}
                />
            </div>
            <InstallmentsReminderDataGrid/>
        </section>
    )
}
