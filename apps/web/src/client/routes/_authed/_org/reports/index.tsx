import { createFileRoute } from '@tanstack/react-router'
import {PageHero} from "@/components/pageHero.tsx";

export const Route = createFileRoute('/_authed/_org/reports/')({
  staticData: {
    breadcrumb: 'Reports',
  },
  component: RouteComponent,
})

function RouteComponent() {
  return (
      <section className="-mt-4 -ml-1">
        <PageHero
            type="hero"
            title="Reports"
            subtitle="Dive deep into the business with reports"
        />
      </section>
  )
}
