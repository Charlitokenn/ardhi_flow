import {createFileRoute} from '@tanstack/react-router'
import {PageHero} from "@/components/pageHero.tsx";
import {BellRingIcon, RadioIcon} from "lucide-react";
import {InstallmentsReminderDataGrid} from "@/components/data-grids/installments-reminder-datagrid.tsx";
import {Button} from "@/components/ui/button.tsx";
import {ReusableSheet} from "@/components-reusable/reusable-sheet.tsx"
import MessagingPortal from "@/components/messaging/messaging-portal.tsx";

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
                            <RadioIcon className="size-4"/> Message Broadcast
                        </Button>
                    }
                    widthClassName="sm:max-w-full"
                    children={<MessagingPortal/>}
                />
            </div>
            <InstallmentsReminderDataGrid/>
        </section>
    )
}
