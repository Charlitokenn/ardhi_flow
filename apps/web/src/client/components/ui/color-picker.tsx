/**
 * color-picker.tsx
 *
 * Reusable shadcn/ui style color picker for React (Vite + shadcn/ui setup).
 * Drop this at `components/ui/color-picker.tsx` and use it like any other
 * controlled input:
 *
 *   const [color, setColor] = useState('#56d799')
 *   <ColorPicker value={color} onChange={setColor} label="Brand color" />
 *
 * Requires:
 *   npm install react-colorful
 *
 * Assumes the standard shadcn/ui primitives already exist in your project:
 *   components/ui/popover.tsx
 *   components/ui/input.tsx
 *   lib/utils.ts (the `cn` helper)
 * These are the default files `npx shadcn add popover input` generates, so
 * if you've run the shadcn CLI before this should just work out of the box.
 */
import * as React from 'react'
import {HexAlphaColorPicker, HexColorPicker} from 'react-colorful'
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover'
import {Input} from '@/components/ui/input'
import {cn} from '@/lib/utils'

export interface ColorPickerProps {
    /** Hex color string, e.g. '#56d799' or '#56d799cc' when alpha is enabled. */
    value?: string
    /** Called with the new hex string whenever the color changes. */
    onChange?: (hex: string) => void
    /** Label shown in the popover header. */
    label?: string
    /** Show the alpha channel. Defaults to true. */
    showAlpha?: boolean
    disabled?: boolean
    /** Extra classes for the trigger button. */
    className?: string
}

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i

export function ColorPicker({
                                value = '#56d799',
                                onChange,
                                label = 'Color',
                                showAlpha = true,
                                disabled = false,
                                className,
                            }: ColorPickerProps) {
    const [open, setOpen] = React.useState(false)
    // Local text-field state so users can type freely (e.g. mid-edit hex)
    // without every keystroke needing to be a valid color.
    const [hexInput, setHexInput] = React.useState(value)

    React.useEffect(() => {
        setHexInput(value)
    }, [value])

    const Picker = showAlpha ? HexAlphaColorPicker : HexColorPicker

    function handlePickerChange(hex: string) {
        setHexInput(hex)
        onChange?.(hex)
    }

    function handleHexInputChange(e: React.ChangeEvent<HTMLInputElement>) {
        const next = e.target.value
        setHexInput(next)
        if (HEX_RE.test(next)) {
            onChange?.(next)
        }
    }

    function handleHexInputBlur() {
        // Revert to the last valid value if what's left isn't a valid hex color.
        if (!HEX_RE.test(hexInput)) {
            setHexInput(value)
        }
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    disabled={disabled}
                    className={cn(
                        'inline-flex min-w-36 items-center gap-2 px-3 py-2 rounded-md bg-background border border-input transition hover:bg-accent/50 data-[state=open]:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed',
                        className,
                    )}
                >
          <span
              className="w-5 h-5 rounded-sm border border-black/10 shrink-0 checkerboard-bg"
              style={{backgroundColor: value}}
          />
                    <span className="text-sm font-mono text-foreground">{value}</span>
                </button>
            </PopoverTrigger>

            <PopoverContent side="bottom" sideOffset={8} className="w-[240px] p-4">
                <div className="flex flex-col gap-4">
                    {/* Header with swatch */}
                    <div className="flex items-center gap-3">
            <span
                className="w-8 h-8 rounded-md border border-black/10 shrink-0 checkerboard-bg"
                style={{backgroundColor: value}}
            />
                        <div className="flex flex-col">
                            <span className="text-sm font-medium text-foreground">{label}</span>
                            <code className="text-xs text-muted-foreground">{value}</code>
                        </div>
                    </div>

                    {/* react-colorful area + hue (+ alpha) sliders */}
                    <div className="color-picker-wrap">
                        <Picker color={value} onChange={handlePickerChange}/>
                    </div>

                    {/* Hex field */}
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-medium text-muted-foreground">Hex</label>
                        <Input
                            value={hexInput}
                            onChange={handleHexInputChange}
                            onBlur={handleHexInputBlur}
                            placeholder="#000000"
                            className="font-mono text-sm"
                        />
                    </div>
                </div>
            </PopoverContent>

            <style>{`
        .color-picker-wrap .react-colorful {
          width: 100%;
          height: 180px;
          gap: 12px;
        }
        .color-picker-wrap .react-colorful__saturation {
          border-radius: 6px;
          border-bottom: none;
        }
        .color-picker-wrap .react-colorful__hue,
        .color-picker-wrap .react-colorful__alpha {
          height: 12px;
          border-radius: 999px;
        }
        .color-picker-wrap .react-colorful__pointer {
          width: 16px;
          height: 16px;
        }
        .checkerboard-bg {
          background-image:
            linear-gradient(45deg, #808080 25%, transparent 25%),
            linear-gradient(-45deg, #808080 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, #808080 75%),
            linear-gradient(-45deg, transparent 75%, #808080 75%);
          background-size: 8px 8px;
          background-position: 0 0, 0 4px, 4px -4px, -4px 0px;
          background-color: #404040;
        }
      `}</style>
        </Popover>
    )
}