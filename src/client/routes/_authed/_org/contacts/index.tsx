import {createFileRoute} from '@tanstack/react-router'
import {useAuth} from "@clerk/react"
import {useQueryClient} from "@tanstack/react-query"
import {PageHero} from "@/components/pageHero.tsx";
import {ContactsDataGrid} from "@/components/data-grids/contacts-datagrid.tsx";
import {
    type CsvFieldConfig,
    type CsvImportSummary,
    ReusableCSVUploader
} from "@/components-reusable/reusable-csv-uploader.tsx"
import {apiClient} from "@/lib/api.ts"
import type {NewContact} from "../../../../../../drizzle/tenant/schema"
import {AddEditContactForm} from "@/components/forms/contacts/add-edit-contact-form.tsx"
import {Button} from "@/components/ui/button.tsx"
import {FilesIcon, UserPlusIcon} from "lucide-react"
import {ReusableSheet} from "@/components-reusable/reusable-sheet.tsx"

export const Route = createFileRoute('/_authed/_org/contacts/')({
    staticData: {
        breadcrumb: 'Contacts',
    },
    component: RouteComponent,
})

const contactFields: CsvFieldConfig<NewContact>[] = [
    {key: "fullName", label: "Full Name", type: "string", required: true},
    {key: "mobileNumber", label: "Mobile", type: "string", required: true},
    {key: "altMobileNumber", label: "Alt Mobile", type: "string"},
    {key: "email", label: "Email", type: "string"},
    {key: "gender", label: "Gender", type: "enum", enumValues: ["MALE", "FEMALE"] as const},
    {
        key: "contactType",
        label: "Contact Type",
        type: "enum",
        enumValues: ['CLIENT', 'LAND_SELLER', 'AUDITOR', 'ICT_SUPPORT', 'SURVEYOR', 'SALES_AGENT'] as const,
        required: true
    },
    {
        key: "idType",
        label: "ID Type",
        type: "enum",
        enumValues: ['NATIONAL_ID', 'PASSPORT', 'DRIVER_LICENSE', 'VOTER_ID']
    },
    {key: "idNumber", label: "ID Number", type: "string"},
    {key: "region", label: "Region", type: "string"},
    {key: "district", label: "District", type: "string"},
    {key: "ward", label: "Ward", type: "string"},
    {key: "street", label: "Street", type: "string"},
    {key: "firstNOKName", label: "1st Next of Keen Name", type: "string"},
    {key: "firstNOKMobile", label: "1st Next of Keen Mobile", type: "string"},
    {
        key: "firstNOKRelationship",
        label: "Relationship to 1st Next of Keen",
        type: "enum",
        enumValues: ['PARENT', 'SIBLING', 'SPOUSE', 'FRIEND', 'OTHER'] as const,
    },
    {key: "secondNOKName", label: "2nd Next of Keen Name", type: "string"},
    {key: "secondNOKMobile", label: "2nd Next of Keen Name", type: "string"},
    {
        key: "secondNOKRelationship",
        label: "Relationship to 2nd Next of Keen",
        type: "enum",
        enumValues: ['PARENT', 'SIBLING', 'SPOUSE', 'FRIEND', 'OTHER'] as const,
    },
    {key: "smsOptOut", label: "Opt to Marketing SMS", type: "boolean"},
];

function RouteComponent() {
    const {getToken} = useAuth()
    const queryClient = useQueryClient()
    const api = apiClient(getToken)

    const handleBulkImport = async (rows: NewContact[]): Promise<CsvImportSummary> => {
        const res = await api.api.contacts.bulk.$post({json: {rows}})
        if (!res.ok) {
            throw new Error(`Failed to import contacts (${res.status})`)
        }
        const summary = await res.json()
        if (summary.created > 0) {
            await queryClient.invalidateQueries({queryKey: ["contacts"]})
        }
        return summary
    }

    return (
        <section className="-mt-4 -ml-1">
            <div className="flex justify-between items-center">
                <PageHero
                    type="hero"
                    title="Contacts"
                    subtitle="Manage all contacts i.e. clients and suppliers"
                />
                <div className="flex gap-2 items-center">
                    <AddEditContactForm
                        mode="add"
                        trigger={<Button><UserPlusIcon/> New Contact</Button>}
                    />

                    <ReusableSheet
                        title="Contacts Bulk Upload"
                        trigger={
                            <Button variant="outline" size="icon">
                                <FilesIcon className="size-5"/>
                            </Button>
                        }
                        widthClassName="sm:max-w-full"
                        children={
                            <ReusableCSVUploader
                                entityName="contacts"
                                fields={contactFields}
                                onSubmit={handleBulkImport}
                            />
                        }
                    />
                </div>
            </div>
            <ContactsDataGrid/>
        </section>
    )
}