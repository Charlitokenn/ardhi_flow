import {Skeleton} from "@/components/ui/skeleton";

export interface VerticalTabsSkeletonProps {
    tabCount?: number;
    className?: string;
    contentClassName?: string;
}

export default function VerticalTabsSkeleton({
                                                 tabCount = 3,
                                                 className = "",
                                                 contentClassName = "",
                                             }: VerticalTabsSkeletonProps) {
    return (
        <div className={`flex mt-8 min-h-[calc(100vh-6rem)] ${className}`}>
            {/* Sidebar skeleton */}
            <div className="flex flex-col gap-0 min-w-35 pr-2 border-r border-dashed border-border">
                {Array.from({length: tabCount}).map((_, i) => (
                    <div
                        key={i}
                        className="flex items-center gap-2 px-4 py-2 w-full"
                    >
                        <Skeleton className="h-8 w-40"/>
                    </div>
                ))}
            </div>

            {/* Content area skeleton - fills full height */}
            <div className={`flex-1 pl-6 ${contentClassName}`}>
                <Skeleton className="h-full w-full"/>
            </div>
        </div>
    );
}