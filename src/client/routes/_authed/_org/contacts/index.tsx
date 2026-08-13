import { createFileRoute } from '@tanstack/react-router'
import {PageHero} from "@/components/pageHero.tsx";
import {UserPlusIcon} from "lucide-react";

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
          />
      </section>
  )
}
