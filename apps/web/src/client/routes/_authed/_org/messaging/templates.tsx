import {createFileRoute} from '@tanstack/react-router'
import {PlusIcon} from 'lucide-react'
import {PageHero} from "@/components/pageHero.tsx"
import {MessageTemplatesDataGrid} from "@/components/data-grids/message-templates-datagrid.tsx"
import {MessageTemplateForm} from "@/components/forms/messaging/message-template-form.tsx"

export const Route = createFileRoute('/_authed/_org/messaging/templates')({
    staticData: {
        breadcrumb: 'Templates',
    },
    component: RouteComponent,
})

function RouteComponent() {
    return (
        <section className="-mt-4 -ml-1">
            <PageHero
                type="hero"
                title="Message Templates"
                subtitle="Reusable SMS text for the messaging flow"
                showButton
                buttonText="New Template"
                buttonIcon={<PlusIcon className="size-4"/>}
                sheetTitle="New template"
                sheetSizeClass="sm:max-w-xl"
                sheetContent={<MessageTemplateForm mode="create"/>}
            />
            <MessageTemplatesDataGrid/>
        </section>
    )
}
