"use client"

import type {ComponentProps, ReactNode} from "react"
import {createContext, useContext, useState} from "react"
import {Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger,} from "@/components/ui/sheet.tsx"
import {cn} from "@/lib/utils.ts"

// ============================================================================
// SheetControl — lets whatever you pass as `children` close itself (e.g. a
// form calling `sheetControl?.close()` from its mutation's onSuccess), without
// that form needing to own or be handed the open/close state itself. This is
// what AddEditContactForm's `useSheetControl()` import resolves to.
// ============================================================================

interface SheetControlValue {
    isOpen: boolean
    open: () => void
    close: () => void
}

const SheetControlContext = createContext<SheetControlValue | null>(null)

export function useSheetControl() {
    return useContext(SheetControlContext)
}

// ============================================================================
// ReusableSheet — the only thing this component is responsible for is the
// chrome (trigger, open state, title bar, sizing, scroll containment) and the
// SheetControl context. It has zero opinions about what's inside: a fully
// self-contained multi-step form like AddEditContactForm (own Stepper, own
// Back/Next/Save row) drops straight in as `children` and just works. Content
// that wants a *pinned* action bar instead — buttons that never scroll away —
// can use the separate `footer` slot.
// ============================================================================

export interface ReusableSheetProps {
    /** Element that opens the sheet, e.g. a <Button>. Wrapped in SheetTrigger's
     *  asChild, so pass exactly one focusable element. Omit for fully
     *  controlled usage (drive `open`/`onOpenChange` yourself instead). */
    trigger?: ReactNode
    title: string
    description?: string
    side?: "right" | "left"
    /** Tailwind width classes, e.g. "sm:max-w-xl" or "sm:max-w-3xl" for a
     *  wide multi-column form. Mobile is always full width. */
    widthClassName?: string
    open?: boolean
    onOpenChange?: (open: boolean) => void
    /** Pinned below the scroll area, border-t, safe-area aware. Use this for
     *  content that has no footer of its own. Skip it — the common case — when
     *  the form you pass as `children` renders its own action row; those
     *  buttons just scroll with the rest of the form, which reads fine inside
     *  a sheet and is how AddEditContactForm already works. */
    footer?: ReactNode
    /** Wraps the body + footer in a single native <form>, so a submit button
     *  in `footer` works with Enter-to-submit and normal form semantics even
     *  though it isn't a DOM descendant of `children`. Only use this when
     *  `children` is NOT itself (or does not contain) a <form> — forms can't
     *  nest. AddEditContactForm already owns its own <form>, so leave this
     *  unset for Pattern A; it's for content built directly against the
     *  `footer` slot instead (Pattern B). */
    onSubmit?: ComponentProps<"form">["onSubmit"]
    children: ReactNode
}

export function ReusableSheet({
                                  trigger,
                                  title,
                                  description,
                                  side = "right",
                                  widthClassName = "sm:max-w-xl",
                                  open: openProp,
                                  onOpenChange,
                                  footer,
                                  onSubmit,
                                  children,
                              }: ReusableSheetProps) {
    const [internalOpen, setInternalOpen] = useState(false)
    const isControlled = openProp !== undefined
    const isOpen = isControlled ? openProp : internalOpen

    const setOpen = (next: boolean) => {
        if (!isControlled) setInternalOpen(next)
        onOpenChange?.(next)
    }

    const control: SheetControlValue = {
        isOpen,
        open: () => setOpen(true),
        close: () => setOpen(false),
    }

    const bodyAndFooter = (
        <>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">
                <SheetControlContext.Provider value={control}>
                    {children}
                </SheetControlContext.Provider>
            </div>

            {footer && (
                <div className="shrink-0 border-t px-6 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                    {footer}
                </div>
            )}
        </>
    )

    return (
        <Sheet open={isOpen} onOpenChange={setOpen}>
            {trigger && <SheetTrigger asChild>{trigger}</SheetTrigger>}

            {/*
              shadcn's SheetContent for side="right"/"left" is already
              `fixed inset-y-0 ... h-full` — pinned to the real viewport, not
              a percentage of some parent, so it can't be clipped by an
              ancestor's overflow and doesn't need a dvh workaround. We turn
              it into a flex column (gap-0, p-0) and own the three regions
              ourselves: header (shrink-0), scrollable body, optional pinned
              footer (shrink-0). Neither the header nor the footer can ever
              be pushed off-screen, on any screen height.
            */}
            <SheetContent
                side={side}
                className={cn("flex w-full flex-col gap-0 p-0", widthClassName)}
            >
                <SheetHeader className="shrink-0 gap-1 border-b pt-[calc(1.25rem+env(safe-area-inset-top))]">
                    <SheetTitle>{title}</SheetTitle>
                    {description && <SheetDescription>{description}</SheetDescription>}
                </SheetHeader>

                {onSubmit ? (
                    <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
                        {bodyAndFooter}
                    </form>
                ) : (
                    bodyAndFooter
                )}
            </SheetContent>
        </Sheet>
    )
}

export default ReusableSheet