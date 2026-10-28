import {useAuth} from "@clerk/react"
import {TriangleAlertIcon} from "lucide-react"
import {useSmsSettings} from "@/lib/use-sms-settings.ts"
import {Button} from "@/components/ui/button.tsx"
import {openOrganizationSettings} from "@/lib/organization-settings-events.ts"

// Shown at the top of the compose flow until the organization connects its
// own NextSMS account (docs/specs/0004-sms-send-flow AC-3). Admins get a
// button straight to the SMS settings page; everyone else is told to ask one.
export function SmsNotConfiguredNotice() {
    const {has} = useAuth()
    const isAdmin = has?.({role: "org:admin"}) ?? false
    const settingsQuery = useSmsSettings()

    if (settingsQuery.data?.configured !== false) return null

    return (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-warning bg-warning/10 p-3 text-sm">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-warning"/>
            <div className="flex-1">
                <p className="font-medium">SMS is not set up</p>
                <p className="text-muted-foreground">
                    {isAdmin
                        ? "Connect your NextSMS account before sending messages."
                        : "Ask an org admin to connect your NextSMS account before sending messages."}
                </p>
            </div>
            {isAdmin && (
                <Button type="button" size="sm" variant="outline" onClick={() => openOrganizationSettings("sms")}>
                    Open SMS settings
                </Button>
            )}
        </div>
    )
}
