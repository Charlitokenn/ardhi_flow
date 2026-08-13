import { createFileRoute } from '@tanstack/react-router'
import {PageHero} from "@/components/pageHero.tsx";

export const Route = createFileRoute('/_authed/_org/messaging/')({
  staticData: {
    breadcrumb: 'Messaging',
  },
  component: RouteComponent,
})

function RouteComponent() {
  return (
      <section className="-mt-4 -ml-1">
        <PageHero
            type="hero"
            title="Messaging"
            subtitle="Send messages to clients"
        />
      </section>
  )
}
