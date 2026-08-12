import { createFileRoute } from '@tanstack/react-router'
import {toast} from "sonner";
import {Button} from "@/components/ui/button.tsx";

export const Route = createFileRoute('/_authed/_org/contacts/')({
    staticData: {
        breadcrumb: 'Contacts',
    },
    component: RouteComponent,
})

function RouteComponent() {
  return       <Button
                  variant="outline"
                  onClick={() =>
                    toast("Event has been created", { position: "top-right" })
                  }
                >
                Top Right
                </Button>
}
