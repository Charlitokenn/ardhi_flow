import {
    ArchiveIcon,
    CalendarSyncIcon,
    CreditCardIcon,
    FilesIcon, HandCoinsIcon, MoonIcon,
    ShoppingCartIcon, SunIcon, SunsetIcon,
    UserPlusIcon, ZapIcon
} from 'lucide-react'
import React, {type JSX } from 'react'
import ReusableSheet from '@/components-reusable/reusable-sheet'
import ReusableTooltip from '@/components-reusable/reusable-tooltip'
import {Button} from "@/components/ui/button.tsx";
import {
    DropdownMenu,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu.tsx";
import {QuickActionsMenu} from "@/components-reusable/reusable-quick-actions.tsx";

type PageHeroProps = {
    title?: string
    subtitle?: string
    type: 'greeting' | 'hero'

    buttonText?: string
    buttonIcon?: React.ReactNode
    showButton?: boolean

    showActionDropdown?: boolean

    showBulkUploader?: boolean
    bulkUploader?: React.ReactNode
    bulkUploaderClass?: string
    bulkUploaderTitle?: string
    bulkUploaderDescription?: string
    bulkUploaderSaveButtonText?: string
    hideBulkUploaderHeader?: boolean
    hideBulkUploaderFooter?: boolean
    /** Content rendered inside the sheet when showButton is true */
    sheetContent?: React.ReactNode
    sheetTitle?: string
    sheetDescription?: string
    sheetIcon?: React.ReactNode
    sheetSaveButtonText?: string
    hideSheetHeader?: boolean
    hideSheetFooter?: boolean
    sheetSizeClass?: string
}

const quickActionGroups = [
    {
        label: "Actions",
        items: [
            {
                label: "Add Contact",
                icon: UserPlusIcon,
                onClick: () => {
                    // navigate or open modal
                },
            },
            {
                label: "Add Sales Contract",
                icon: ShoppingCartIcon,
                onClick: () => {
                    // navigate or open modal
                },
            },
        ],
    },
    {
        label: "Finance",
        items: [
            {
                label: "Add Transaction",
                icon: CreditCardIcon,
                onClick: () => {
                    // navigate or open modal
                },
            },
            {
                label: "Create Reconciliation",
                icon: CalendarSyncIcon,
                onClick: () => {
                    // navigate or open modal
                },
            },
        ],
    },
    {
        label: "Projects",
        items: [
            {
                label: "New Project",
                icon: ArchiveIcon,
                onClick: () => {
                    // navigate or open modal
                },
            },
            {
                label: "Record Payment",
                icon: HandCoinsIcon,
                onClick: () => {
                    // navigate or open modal
                },
            },
        ],
    },
];

export const PageHero = ({
                             title,
                             subtitle,
                             type,
                             buttonText,
                             buttonIcon,
                             showButton = false,
                             showActionDropdown = false,
                             showBulkUploader = false,
                             bulkUploader,
                             bulkUploaderClass,
                             bulkUploaderTitle,
                             bulkUploaderDescription,
                             bulkUploaderSaveButtonText,
                             hideBulkUploaderHeader,
                             hideBulkUploaderFooter,
                             sheetContent,
                             sheetTitle,
                             sheetDescription,
                             sheetIcon,
                             sheetSaveButtonText,
                             hideSheetHeader,
                             hideSheetFooter,
                             sheetSizeClass
                         }: PageHeroProps): JSX.Element => {
    return (
        <div className="flex items-center justify-between gap-4 ">
            <div className="space-y-0.1">
                <h1 className="flex items-center gap-2 text-2xl font-medium">
                    {type !== 'hero' && getTimeBasedIcon()}
                    {title}
                </h1>
                <p className="text-sm text-muted-foreground">{subtitle}</p>
            </div>
            <div className="flex flex-row gap-2">
                {showButton && (
                    <ReusableSheet
                        trigger={
                            <Button className=" ">
                                {buttonIcon}
                                <span>{buttonText}</span>
                            </Button>
                        }
                        title={sheetTitle ?? ''}
                        description={sheetDescription}
                        titleIcon={sheetIcon}
                        formContent={sheetContent}
                        saveButtonText={sheetSaveButtonText}
                        hideHeader={hideSheetHeader}
                        hideFooter={hideSheetFooter}
                        popupClass={sheetSizeClass}
                    />
                )}
                {showBulkUploader && (
                    <ReusableSheet
                        trigger={
                            <ReusableTooltip
                                trigger={<FilesIcon className="cursor-pointer" />}
                                tooltip="Bulk Upload"
                            />
                        }
                        title={bulkUploaderTitle ?? ''}
                        description={bulkUploaderDescription}
                        titleIcon={sheetIcon}
                        formContent={bulkUploader}
                        saveButtonText={bulkUploaderSaveButtonText}
                        hideHeader={hideBulkUploaderHeader}
                        hideFooter={hideBulkUploaderFooter}
                        popupClass={bulkUploaderClass}
                    />
                )}
                { showActionDropdown && (
                    <div className="flex items-center justify-center">
                        <DropdownMenu>
                            <DropdownMenuTrigger>
                                <Button variant="outline" className="w-fit"><ZapIcon/>Quick Actions</Button>
                            </DropdownMenuTrigger>
                            <QuickActionsMenu groups={quickActionGroups} />
                        </DropdownMenu>
                    </div>
                )}
            </div>
        </div>
    )
}

export function getTimeBasedIcon(date: Date = new Date()): JSX.Element {
    const hour = date.getHours()

    // 🌙 Night: 19 → 04
    if (hour >= 19 || hour < 5) {
        return <MoonIcon className="size-5" />
    }

    // 🌅 Sunrise: 05 → 08
    // if (hour >= 5 && hour < 9) {
    //   return <DayCloudyIcon className="size-7" />
    // }

    // ☀️ Day: 05 → 16
    if (hour >= 5 && hour < 17) {
        return <SunIcon className="size-5" />
    }

    // 🌇 Sunset: 17 → 18
    return <SunsetIcon className="size-5" />
}