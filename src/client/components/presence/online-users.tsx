import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,} from "@/components/ui/tooltip";
import {Avatar, AvatarFallback, AvatarImage} from "@/components/ui/avatar";
import {cn} from "@/lib/utils";
import {useTenantPresence} from "@/hooks/use-tenant-presence";

const MAX_VISIBLE = 5;

function initials(name: string) {
    return name
        .split(" ")
        .map((part) => part[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase();
}

/**
 * Drop this anywhere inside a tenant-scoped layout (e.g. the dashboard
 * topbar) to show who else in the org is currently online.
 *
 *   <OnlineUsers />
 */
export function OnlineUsers({className}: { className?: string }) {
    const {onlineUsers, isConnected} = useTenantPresence();

    if (!isConnected || onlineUsers.length === 0) {
        return null;
    }

    const visible = onlineUsers.slice(0, MAX_VISIBLE);
    const overflow = onlineUsers.length - visible.length;

    return (
        <TooltipProvider delayDuration={150}>
            <div className={cn("group/avatars flex items-center", className)}>
                <div className="flex items-center px-1">
                    {visible.map((user, index) => (
                        <div
                            key={user.connectionId}
                            style={
                                {
                                    "--index": index,
                                    zIndex: visible.length - index,
                                } as React.CSSProperties
                            }
                            className="group/avatar-item relative translate-x-[calc(var(--index)*-8px)] transition-all duration-300 ease-in-out will-change-transform group-hover/avatars:translate-x-[calc(var(--index)*3px)]"
                        >
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Avatar
                                        className={cn(
                                            "ring-background h-8 w-8 origin-center ring-2 transition-transform duration-300 ease-in-out",
                                            "group-hover/avatar-item:scale-110"
                                        )}
                                    >
                                        {user.imageUrl ? (
                                            <AvatarImage src={user.imageUrl} alt={user.name}/>
                                        ) : null}
                                        <AvatarFallback className="text-xs">
                                            {initials(user.name)}
                                        </AvatarFallback>
                                    </Avatar>
                                </TooltipTrigger>
                                <TooltipContent sideOffset={10} side="bottom">
                                    <p className="font-medium">{user.name}</p>
                                    {user.email ? (
                                        <p className="text-xs text-muted-foreground">{user.email}</p>
                                    ) : null}
                                </TooltipContent>
                            </Tooltip>
                            <span
                                className={cn(
                                    "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background",
                                    user.status === "away" ? "bg-amber-400" : "bg-emerald-500"
                                )}
                            />
                        </div>
                    ))}
                </div>
                {overflow > 0 ? (
                    <span className="ml-2 text-xs text-muted-foreground">
            +{overflow} more online
          </span>
                ) : null}
            </div>
        </TooltipProvider>
    );
}