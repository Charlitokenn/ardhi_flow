import React, { createContext, useState } from 'react'
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

interface Props {
    trigger: React.ReactNode
    title: string
    description?: string
    formContent: React.ReactNode
    isInset?: boolean
    saveButtonText?: string
    titleIcon?: React.ReactNode
    hideHeader?: boolean
    hideFooter?: boolean
    popupClass?: string

    /**
     * Optional id used to programmatically identify the trigger.
     */
    triggerId?: string

    /**
     * Optional submit handler for the sheet form.
     */
    onSubmit?: (event: React.SubmitEvent<HTMLFormElement>) => void

    /**
     * Optional side of the screen where the sheet appears.
     */
    side?: 'left' | 'right'
}

interface SheetControlContextValue {
    close: () => void
}

const SheetControlContext =
    createContext<SheetControlContextValue | null>(null)

// export function useSheetControl() {
//     return useContext(SheetControlContext)
// }

export default function ReusableSheet({
                                          trigger,
                                          title,
                                          description,
                                          formContent,
                                          isInset = true,
                                          saveButtonText = 'Save',
                                          titleIcon,
                                          hideHeader = false,
                                          hideFooter = false,
                                          popupClass,
                                          triggerId,
                                          onSubmit,
                                          side = 'right',
                                      }: Props) {
    const [open, setOpen] = useState(false)

    const close = () => setOpen(false)

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
                data-sheet-trigger-id={triggerId}
                className="contents"
            >
                {trigger}
            </SheetTrigger>

            <SheetContent
                side={side}
                className={cn(
                    'overflow-y-auto text-primary',
                    '[&::-webkit-scrollbar]:hidden',
                    '[scrollbar-width:none]',
                    '[-ms-overflow-style:none]',
                    isInset && 'm-2 h-[calc(100vh-1rem)] rounded-lg',
                    popupClass
                )}
            >
                <SheetControlContext.Provider value={{ close }}>
                    {!hideHeader && (
                        <SheetHeader className="p-4">
                            <SheetTitle className="flex items-center gap-2">
                                {titleIcon && (
                                    <span className="shrink-0">
                                        {titleIcon}
                                    </span>
                                )}

                                <span>{title}</span>
                            </SheetTitle>

                            {description && (
                                <SheetDescription>
                                    {description}
                                </SheetDescription>
                            )}

                            <Separator className="mt-2" />
                        </SheetHeader>
                    )}

                    <form
                        className="flex min-h-0 flex-1 flex-col"
                        onSubmit={onSubmit}
                    >
                        <div className="flex-1 px-4 pb-4">
                            {formContent}
                        </div>

                        {!hideFooter && (
                            <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={close}
                                >
                                    Cancel
                                </Button>

                                <Button
                                    type="submit"
                                    className="cursor-pointer"
                                >
                                    {saveButtonText}
                                </Button>
                            </div>
                        )}
                    </form>
                </SheetControlContext.Provider>
            </SheetContent>
        </Sheet>
    )
}