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
    /**
     * Element that opens the sheet when clicked (e.g. a Button).
     * Optional — omit it when you want to open the sheet programmatically
     * via the controlled `open`/`onOpenChange` props instead (e.g. from a
     * row's "Edit" dropdown item in a data grid).
     */
    trigger?: React.ReactNode
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
    // Bug fix: `React.SubmitEvent` does not exist — the correct React type
    // for a <form onSubmit> handler is `React.FormEvent<HTMLFormElement>`.
    onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void

    /**
     * Optional side of the screen where the sheet appears.
     */
    side?: 'left' | 'right'

    /**
     * Controlled open state. Provide this together with `onOpenChange` when
     * the sheet needs to be opened from outside (e.g. an "Edit" row action
     * in a data grid) instead of from the built-in `trigger`.
     * When omitted, the sheet manages its own open state internally.
     */
    open?: boolean

    /**
     * Called whenever the sheet requests to change its open state
     * (closing via Cancel/overlay, or the internal Save submit).
     * Required when using the controlled `open` prop.
     */
    onOpenChange?: (open: boolean) => void
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
                                          open: controlledOpen,
                                          onOpenChange: setControlledOpen,
                                      }: Props) {
    // Uncontrolled fallback state — used when the caller doesn't pass
    // `open`/`onOpenChange` (i.e. the sheet is opened via `trigger`).
    const [uncontrolledOpen, setUncontrolledOpen] = useState(false)

    const isControlled = controlledOpen !== undefined
    const open = isControlled ? controlledOpen : uncontrolledOpen
    const setOpen = isControlled ? setControlledOpen! : setUncontrolledOpen

    const close = () => setOpen(false)

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            {trigger && (
                <SheetTrigger
                    data-sheet-trigger-id={triggerId}
                    className="contents"
                >
                    {trigger}
                </SheetTrigger>
            )}

            <SheetContent
                side={side}
                className={cn(
                    'overflow-y-auto',
                    '[&::-webkit-scrollbar]:hidden',
                    'scrollbar-none',
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