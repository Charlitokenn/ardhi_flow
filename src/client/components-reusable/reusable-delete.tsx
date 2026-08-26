import type {ReactNode} from "react";
import {Button} from "@/components/ui/button";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";

interface ReusableDeleteDialogProps {
    trigger: ReactNode;
    icon?: ReactNode;
    title?: ReactNode;
    description: ReactNode;

    open?: boolean;
    onOpenChange?: (open: boolean) => void;

    onDelete: () => void | Promise<void>;

    isDeleting?: boolean;
    deleteDisabled?: boolean;

    cancelText?: string;
    deleteText?: string;
}

export function ReusableDeleteDialog({
                                         trigger,
                                         icon,
                                         title = "Are you sure?",
                                         description,
                                         open,
                                         onOpenChange,
                                         onDelete,
                                         isDeleting = false,
                                         deleteDisabled = false,
                                         cancelText = "No, Cancel",
                                         deleteText = "Yes, Delete",
                                     }: ReusableDeleteDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogTrigger asChild>
                {trigger}
            </DialogTrigger>

            <DialogContent>
                <DialogHeader className="border-b-2">
                    <div className="flex items-start gap-3 mb-4">
                        {icon && (
                            <div
                                className="bg-destructive/10 text-destructive flex size-10 shrink-0 items-center justify-center rounded-full"
                            >
                                {icon}
                            </div>
                        )}

                        <div className="flex flex-col gap-1">
                            <DialogTitle>{title}</DialogTitle>

                            <DialogDescription>
                                {description}
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <DialogFooter>
                    <DialogClose asChild>
                        <Button
                            variant="outline"
                            disabled={isDeleting}
                        >
                            {cancelText}
                        </Button>
                    </DialogClose>

                    <Button
                        variant="destructive"
                        disabled={isDeleting || deleteDisabled}
                        onClick={onDelete}
                    >
                        {isDeleting ? "Deleting..." : deleteText}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}