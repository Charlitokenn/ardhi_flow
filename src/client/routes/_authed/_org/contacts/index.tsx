import { createFileRoute } from '@tanstack/react-router'
import {PageHero} from "@/components/pageHero.tsx";
import {UserPlusIcon} from "lucide-react";
import {ContactsDataGrid} from "@/components/data-grids/contacts-datagrid.tsx";
import {AddEditContactForm} from "@/components/forms/contacts/add-edit-contact-form.tsx";

export const Route = createFileRoute('/_authed/_org/contacts/')({
    staticData: {
        breadcrumb: 'Contacts',
    },
    component: RouteComponent,
})

function RouteComponent() {
  return (
      <section className="-mt-4 -ml-1">
          <PageHero
              type="hero"
              title="Contacts"
              subtitle="Manage all contacts i.e. clients and suppliers"
              showButton={true}
              buttonText="New Contact"
              buttonIcon={<UserPlusIcon/>}
              showBulkUploader={true}
              sheetTitle="Add contact"
              sheetDescription="Create a new client, supplier, or other contact."
              sheetIcon={<UserPlusIcon/>}
              hideSheetFooter
              sheetSizeClass="w-full sm:max-w-2xl"
              sheetContent={<AddEditContactForm mode="add" />}
          />
          <ContactsDataGrid/>
      </section>
  )
}
