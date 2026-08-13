import { createFileRoute } from '@tanstack/react-router'
import {PageHero} from "@/components/pageHero.tsx";
import {CalendarSyncIcon} from "lucide-react";

export const Route = createFileRoute('/_authed/_org/finance/reconciliation')({
  staticData: {
    breadcrumb: 'Reconciliation',
  },
  component: RouteComponent,
})

function RouteComponent() {
  return (
      <section className="-mt-4 -ml-1">
        <PageHero
            type="hero"
            title="Reconciliation"
            subtitle="Manage all reconciliations here"
            showButton={true}
            buttonText="New Reconciliation"
            buttonIcon={<CalendarSyncIcon/>}
        />
      </section>
  )
}
