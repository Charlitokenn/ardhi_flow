import {useState} from "react";
import {ArchiveIcon, CreditCardIcon, RadioIcon, ShoppingCartIcon, UserPlusIcon, ZapIcon} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {Button} from "@/components/ui/button.tsx";
import {ReusableSheet} from "@/components-reusable/reusable-sheet";
import {AddEditContactForm} from "@/components/forms/contacts/add-edit-contact-form.tsx";
import {AddEditProjectsForm} from "@/components/forms/projects/add-edit-projects-form.tsx";
import MessagingPortal from "@/components/messaging/messaging-portal.tsx";

interface QuickActionsMenuProps {
    side?: "top" | "right" | "bottom" | "left";
    className?: string;
}

/**
 * ============================================================================
 * ADAPTING THIS TEMPLATE
 * ============================================================================
 * Each item below declares its own `sheetTitle`/`sheetDescription`, which are
 * used to render a `ReusableSheet` when the item is clicked (instead of the
 * previous no-op `onClick`). The sheet's `formContent` is currently a simple
 * placeholder — once the real forms for each action exist (e.g. an
 * `AddContactForm`, `AddTransactionForm`, ...), swap the placeholder for the
 * actual form component and wire `onSubmit` to its submit handler.
 *
 * To add a new quick action:
 * 1. Add an entry to the relevant group in `actionGroups` with a unique
 *    `label`, `icon`, `sheetTitle`, and `sheetDescription`.
 * 2. Once its form component is ready, render it in place of the
 *    placeholder inside `renderSheetFormContent` (switch on `label`).
 * ============================================================================
 */
const actionGroups = [
    {
        label: "Actions",
        items: [
            {
                label: "Add Contact",
                icon: UserPlusIcon,
                sheetTitle: "Add Contact",
                sheetDescription: "Create a new contact record.",
            },
            {
                label: "Add Sales Contract",
                icon: ShoppingCartIcon,
                sheetTitle: "Add Sales Contract",
                sheetDescription: "Create a new sales contract.",
            },
        ],
    },
    {
        label: "Finance",
        items: [
            {
                label: "Add Transaction",
                icon: CreditCardIcon,
                sheetTitle: "Add Transaction",
                sheetDescription: "Record a new financial transaction.",
            },
            {
                label: "Message Broadcasting",
                icon: RadioIcon,
                sheetTitle: "Message Broadcasting",
                sheetDescription: "",
            },
        ],
    },
    {
        label: "Projects",
        items: [
            {
                label: "New Project",
                icon: ArchiveIcon,
                sheetTitle: "New Project",
                sheetDescription: "Create a new project.",
            },
        ],
    },
];

// Flat lookup of all items (across groups) by label, used to find the
// active item's `sheetTitle`/`sheetDescription` when rendering the sheet.
const allItems = actionGroups.flatMap((group) => group.items);

export function QuickActionsMenu({
                                     side = "left",
                                     className = "w-auto",
                                 }: QuickActionsMenuProps) {
    // Label of the item whose sheet is currently open, or `null` when no
    // sheet should be shown. Using a single piece of state (instead of one
    // boolean per item) keeps only one quick-action sheet open at a time.
    const [activeLabel, setActiveLabel] = useState<string | null>(null);

    const activeItem = allItems.find((item) => item.label === activeLabel);

    return (
        <div className="flex items-center justify-center">
            <DropdownMenu>
                <DropdownMenuTrigger>
                    <Button variant="outline" className="w-fit">
                        <ZapIcon/>
                        Quick Actions
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side={side} className={className}>
                    {actionGroups.map((group, groupIndex) => (
                        <div key={group.label}>
                            {groupIndex > 0 && <DropdownMenuSeparator/>}

                            <DropdownMenuGroup>
                                <DropdownMenuLabel>{group.label}</DropdownMenuLabel>

                                {group.items.map((item) => {
                                    const Icon = item.icon;

                                    return (
                                        <DropdownMenuItem
                                            key={item.label}
                                            onClick={() => setActiveLabel(item.label)}
                                            className="cursor-pointer"
                                        >
                                            <Icon/>
                                            {item.label}
                                        </DropdownMenuItem>
                                    );
                                })}
                            </DropdownMenuGroup>
                        </div>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>

            {/*
              Render AddEditContactForm/AddEditProjectsForm directly for the
              actions that have their own sheet ("Add Contact", "New
              Project"), otherwise use ReusableSheet's placeholder for
              actions that don't have a real form yet.
            */}
            {activeItem?.label === "Add Contact" ? (
                <AddEditContactForm
                    mode="add"
                    open={activeItem?.label === "Add Contact"}
                    onOpenChange={(open) => {
                        if (!open) setActiveLabel(null);
                    }}
                    onSuccess={() => setActiveLabel(null)}
                />
            ) : activeItem?.label === "New Project" ? (
                <AddEditProjectsForm
                    mode="add"
                    open={activeItem?.label === "New Project"}
                    onOpenChange={(open) => {
                        if (!open) setActiveLabel(null);
                    }}
                    onSuccess={() => setActiveLabel(null)}
                />
            ) : activeItem?.label === "Message Broadcasting" ? (
                <ReusableSheet
                    open={activeItem !== undefined}
                    onOpenChange={(open) => {
                        if (!open) setActiveLabel(null);
                    }}
                    title={activeItem?.sheetTitle ?? ""}
                    description={activeItem?.sheetDescription}
                    widthClassName="sm:max-w-full"
                    children={<MessagingPortal/>}
                />
            ) : (
                <ReusableSheet
                    open={activeItem !== undefined}
                    onOpenChange={(open) => {
                        if (!open) setActiveLabel(null);
                    }}
                    title={activeItem?.sheetTitle ?? ""}
                    description={activeItem?.sheetDescription}
                    children={
                        <div className="text-sm text-muted-foreground">
                            {/* TODO: replace with the real form for "{activeItem?.label}" once it exists. */}
                            Form for &quot;{activeItem?.label}&quot; goes here.
                        </div>
                    }
                    onSubmit={(event) => {
                        event.preventDefault();
                        // TODO: hook up the real submit handler for the active
                        // action's form (e.g. create transaction/etc.) once it's
                        // implemented, then close the sheet.
                        setActiveLabel(null);
                    }}
                />
            )}
        </div>
    );
}
