import { MoonIcon, SunIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useTheme } from "@/components/theme-provider"
import { Swap, SwapOff, SwapOn } from "@/components/ui/swap";

function useResolvedTheme() {
    const { theme } = useTheme();
    if (theme !== "system") return theme;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ModeToggle() {
    const { setTheme, theme } = useTheme()
    const resolved = useResolvedTheme();

    return (
        <Swap
            swapped={resolved === "dark"}
            onSwappedChange={(isDark) => setTheme(isDark ? "dark" : "light")}
            aria-label="Toggle theme"
        >
            <SwapOn>
                <MoonIcon className="h-5 w-5" />
            </SwapOn>
            <SwapOff>
                <SunIcon className="h-5 w-5" />
            </SwapOff>
        </Swap>
    )
}