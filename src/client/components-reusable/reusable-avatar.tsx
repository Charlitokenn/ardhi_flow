import {cn} from "@/lib/utils"
import {Avatar, AvatarFallback, AvatarImage,} from "@/components/ui/avatar"
import {Tooltip, TooltipContent, TooltipTrigger,} from "@/components/ui/tooltip"

const avatars = [
    {
        src: "https://images.unsplash.com/photo-1607990281513-2c110a25bd8c?w=96&h=96&dpr=2&q=80",
        fallback: "DK",
        name: "David Kim",
    },
    {
        src: "https://github.com/maxleiter.png",
        fallback: "ML",
        name: "Max Leiter",
    },
    {
        src: "https://images.unsplash.com/photo-1543299750-19d1d6297053?w=96&h=96&dpr=2&q=80",
        fallback: "JB",
        name: "James Brown",
    },
]

export function ReusableAvatar() {
    return (
        <>
            <div className="group/avatars flex items-center px-2">
                {avatars.map((avatar, index) => (
                    <div
                        key={index}
                        style={
                            {
                                "--index": index,
                                zIndex: avatars.length - index,
                            } as React.CSSProperties
                        }
                        className="group/avatar-item translate-x-[calc(var(--index)*-8px)] transition-all duration-300 ease-in-out will-change-transform group-hover/avatars:translate-x-[calc(var(--index)*3px)]"
                    >
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Avatar
                                    className={cn(
                                        "ring-background origin-center ring-2 transition-transform duration-300 ease-in-out",
                                        "group-hover/avatar-item:scale-110"
                                    )}
                                >
                                    <AvatarImage src={avatar.src} alt={avatar.name}/>
                                    <AvatarFallback className="text-xs">
                                        {avatar.fallback}
                                    </AvatarFallback>
                                </Avatar>
                            </TooltipTrigger>
                            <TooltipContent sideOffset={10}>{avatar.name}</TooltipContent>
                        </Tooltip>
                    </div>
                ))}
            </div>
            <div/>
            <div/>
        </>
    )
}
