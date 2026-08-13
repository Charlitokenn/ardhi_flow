import type { LucideIcon } from "lucide-react";
import {
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export interface QuickAction {
    label: string;
    icon: LucideIcon;
    onClick?: () => void;
}

export interface QuickActionGroup {
    label: string;
    items: QuickAction[];
}

interface QuickActionsMenuProps {
    groups: QuickActionGroup[];
    side?: "top" | "right" | "bottom" | "left";
    className?: string;
}

export function QuickActionsMenu({
                                     groups,
                                     side = "left",
                                     className = "w-auto",
                                 }: QuickActionsMenuProps) {
    return (
        <DropdownMenuContent side={side} className={className}>
            {groups.map((group, groupIndex) => (
                <div key={group.label}>
                    {groupIndex > 0 && <DropdownMenuSeparator />}

                    <DropdownMenuGroup>
                        <DropdownMenuLabel>{group.label}</DropdownMenuLabel>

                        {group.items.map((item) => {
                            const Icon = item.icon;

                            return (
                                <DropdownMenuItem
                                    key={item.label}
                                    onClick={item.onClick}
                                    className="cursor-pointer"
                                >
                                    <Icon />
                                    {item.label}
                                </DropdownMenuItem>
                            );
                        })}
                    </DropdownMenuGroup>
                </div>
            ))}
        </DropdownMenuContent>
    );
}