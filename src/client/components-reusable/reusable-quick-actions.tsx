import {
    ArchiveIcon,
    CalendarSyncIcon,
    CreditCardIcon, HandCoinsIcon,
    ShoppingCartIcon,
    UserPlusIcon,
    ZapIcon
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {Button} from "@/components/ui/button.tsx";

interface QuickActionsMenuProps {
    side?: "top" | "right" | "bottom" | "left";
    className?: string;
}

const actionGroups = [
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

export function QuickActionsMenu({
                                     side = "left",
                                     className = "w-auto",
                                 }: QuickActionsMenuProps) {
    return (
        <div className="flex items-center justify-center">
            <DropdownMenu>
                <DropdownMenuTrigger>
                    <Button variant="outline" className="w-fit"><ZapIcon/>Quick Actions</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side={side} className={className}>
                    {actionGroups.map((group, groupIndex) => (
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
            </DropdownMenu>
        </div>

    );
}