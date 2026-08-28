import {useState} from "react"
import {OrganizationProfile, useAuth, useOrganization} from "@clerk/react"
import {useQuery} from "@tanstack/react-query"
import {Dialog, DialogContent} from "@/components/ui/dialog"
import {SettingsIcon} from "lucide-react"
import {toast} from "sonner"
import {ShieldUserIcon} from "@/assets/icons"
import {DropdownMenu, DropdownMenuTrigger} from "@/components/ui/dropdown-menu"
import {SidebarMenu, SidebarMenuButton, SidebarMenuItem} from "@/components/ui/sidebar"
import {apiClient} from "@/lib/api.ts"
import OrganizationSettings from "@/components/organization-settings.tsx"

export function TeamSwitcher() {
    const {organization} = useOrganization()
    const {getToken, has} = useAuth()
    const isAdmin = has?.({role: 'org:admin'})
    const [open, setOpen] = useState(false)
    const api = apiClient(getToken)

    // Same tenant-scoped `company_settings` row edited in the Branding page
    // below — shares the "company-settings" query key so a save there
    // (branding-settings-form.tsx) invalidates this too and the slogan
    // updates here without a manual refetch.
    const settingsQuery = useQuery({
        queryKey: ["company-settings"],
        queryFn: async () => {
            const res = await api.api["company-settings"].$get()
            if (!res.ok) throw new Error(`Failed to load company settings (${res.status})`)
            return res.json()
        },
        enabled: !!organization,
    })

    if (!organization) return null

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <SidebarMenuButton
                            size="lg"
                            onClick={() => {
                                if (!isAdmin) {
                                    toast('Unauthorized', {
                                        description: `Only admins can manage organization settings`,
                                        duration: 5000,
                                        icon: <ShieldUserIcon className="size-6"/>,
                                    })
                                    return
                                }
                                setOpen(true)
                            }}
                        >
                            <div
                                className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                                <img src={organization.imageUrl} className="rounded-lg size-8 object-cover" alt="logo"/>
                            </div>
                            <div className="grid flex-1 text-left text-sm leading-tight">
                                <span className="truncate font-medium font-ubuntu">{organization.name}</span>
                                {settingsQuery.data?.slogan && (
                                    <span className="truncate text-xs text-muted-foreground">
                                        "{settingsQuery.data.slogan}"
                                    </span>
                                )}
                            </div>
                        </SidebarMenuButton>
                    </DropdownMenuTrigger>
                </DropdownMenu>
            </SidebarMenuItem>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent
                    showCloseButton={false}
                    className="bg-transparent border-none shadow-none p-0 sm:max-w-fit w-[calc(100vw-1rem)] max-h-[calc(100vh-1rem)] overflow-hidden"
                >
                    <OrganizationProfile
                        routing="hash"
                        appearance={{
                            elements: {
                                // rootBox: "w-fit h-fit",
                                // cardBox: "w-fit h-fit shadow-none border-none",
                                // navbar: "border-r border-border/50",
                            },
                        }}
                    >
                        <OrganizationProfile.Page
                            label="Settings"
                            url="settings"
                            labelIcon={<SettingsIcon className="size-4"/>}
                        >
                            <OrganizationSettings/>
                        </OrganizationProfile.Page>
                    </OrganizationProfile>
                </DialogContent>
            </Dialog>
        </SidebarMenu>
    )
}