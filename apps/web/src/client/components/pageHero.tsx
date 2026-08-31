import {FilesIcon, MoonIcon, SunIcon, SunsetIcon,} from 'lucide-react'
import React, {type JSX} from 'react'
import ReusableSheet from '@/components-reusable/reusable-sheet'
import ReusableTooltip from '@/components-reusable/reusable-tooltip'
import {Button} from "@/components/ui/button.tsx";

type PageHeroProps = {
    title?: string
    subtitle?: string | React.ReactNode
    type: 'greeting' | 'hero'

    buttonText?: string
    buttonIcon?: React.ReactNode
    showButton?: boolean

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

export const PageHero = ({
                             title,
                             subtitle,
                             type,
                             buttonText,
                             buttonIcon,
                             showButton = false,
                             showBulkUploader = false,
                             bulkUploader,
                             bulkUploaderClass,
                             bulkUploaderTitle,
                             bulkUploaderDescription,
                             sheetContent,
                             sheetTitle,
                             sheetDescription,
                             sheetSizeClass
                         }: PageHeroProps): JSX.Element => {
    return (
        <div className="flex items-center justify-between gap-4 mb-8">
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
                        children={sheetContent}
                        widthClassName={sheetSizeClass}
                    />
                )}
                {showBulkUploader && (
                    <ReusableSheet
                        trigger={
                            <ReusableTooltip
                                trigger={<FilesIcon className="cursor-pointer"/>}
                                tooltip="Bulk Upload"
                            />
                        }
                        title={bulkUploaderTitle ?? ''}
                        description={bulkUploaderDescription}
                        children={bulkUploader}
                        widthClassName={bulkUploaderClass}
                    />
                )}
            </div>
        </div>
    )
}

export function getTimeBasedIcon(date: Date = new Date()): JSX.Element {
    const hour = date.getHours()

    // 🌙 Night: 19 → 04
    if (hour >= 19 || hour < 5) {
        return <MoonIcon className="size-5"/>
    }

    // 🌅 Sunrise: 05 → 08
    // if (hour >= 5 && hour < 9) {
    //   return <DayCloudyIcon className="size-7" />
    // }

    // ☀️ Day: 05 → 16
    if (hour >= 5 && hour < 17) {
        return <SunIcon className="size-5"/>
    }

    // 🌇 Sunset: 17 → 18
    return <SunsetIcon className="size-5"/>
}