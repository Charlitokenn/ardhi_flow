import {createFileRoute} from '@tanstack/react-router'
import {FilePlusCornerIcon} from 'lucide-react'
import {PageHero} from "@/components/pageHero.tsx"
import {MessageTemplatesDataGrid} from "@/components/data-grids/message-templates-datagrid.tsx"
import {MessageTemplateForm} from "@/components/forms/messaging/message-template-form.tsx"
import {Button} from "@/components/ui/button.tsx";
import {ReusableSheet} from "@/components-reusable/reusable-sheet.tsx"

export const Route = createFileRoute('/_authed/_org/messaging/templates')({
    staticData: {
        breadcrumb: 'Templates',
    },
    component: RouteComponent,
})

function RouteComponent() {
    return (
        <section className="-mt-4 -ml-1">
            <div className="flex justify-between items-center">
                <PageHero
                    type="hero"
                    title="Messaging Templates"
                    subtitle="Create and manage messaging templates"
                />
                <ReusableSheet
                    title="New Template"
                    trigger={
                        <Button variant="outline">
                            <FilePlusCornerIcon className="size-4"/> New Template
                        </Button>
                    }
                    widthClassName="sm:max-w-full"
                    children={<MessageTemplateForm mode="create"/>}
                />
            </div>
            <MessageTemplatesDataGrid/>
        </section>
    )
}
