import {useState} from "react"
import {OrganizationProfile, useAuth, useOrganization} from "@clerk/react"
import {Dialog, DialogContent} from "@/components/ui/dialog"
import {PaletteIcon} from "lucide-react"
import {toast} from "sonner"
import {ShieldUserIcon} from "@/assets/icons"
import {BrandingSettingsForm} from "@/components/forms/company/branding-settings-form.tsx"
import {DropdownMenu, DropdownMenuTrigger} from "@/components/ui/dropdown-menu"
import {SidebarMenu, SidebarMenuButton, SidebarMenuItem} from "@/components/ui/sidebar"

export function TeamSwitcher() {
    const {organization} = useOrganization()
    const {has} = useAuth()
    const isAdmin = has?.({role: 'org:admin'})
    const [open, setOpen] = useState(false)

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
                                {/*<span className="truncate text-xs">{organization.name}</span>*/}
                            </div>
                        </SidebarMenuButton>
                    </DropdownMenuTrigger>
                </DropdownMenu>
            </SidebarMenuItem>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent
                    showCloseButton={false}
                    className="p-2 items-center bg-transparent overflow-hidden sm:max-w-4xl h-[85vh] sm:h-180"
                >
                    <OrganizationProfile
                        routing="hash"
                        appearance={{
                            elements: {
                                rootBox: "w-full h-full",
                                cardBox: "w-full h-full shadow-none border-none",
                            },
                        }}
                    >
                        <OrganizationProfile.Page label="general"/>
                        <OrganizationProfile.Page label="members"/>
                        <OrganizationProfile.Page
                            label="Branding"
                            url="branding"
                            labelIcon={<PaletteIcon className="size-4"/>}
                        >
                            <BrandingSettingsForm/>
                        </OrganizationProfile.Page>
                    </OrganizationProfile>
                </DialogContent>
            </Dialog>
        </SidebarMenu>
    )
}