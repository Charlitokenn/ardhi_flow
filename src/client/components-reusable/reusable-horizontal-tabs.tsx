import type {ReactNode} from "react"
import type {LucideIcon} from "lucide-react"
import {Tabs, TabsContent, TabsList, TabsTrigger,} from "@/components/ui/tabs"

export interface HorizontalTabItem {
    value: string
    label: string
    icon: LucideIcon
    content: ReactNode
}

interface HorizontalTabsProps {
    tabs: HorizontalTabItem[]
    defaultValue?: string
    className?: string
}

export function ReusableHorizontalTabs({
                                           tabs,
                                           defaultValue,
                                           className,
                                       }: HorizontalTabsProps) {
    const firstTab = tabs[0]?.value

    if (!tabs.length) {
        return null
    }

    return (
        <Tabs
            defaultValue={defaultValue ?? firstTab}
            className={`w-full ${className ?? ""}`}
        >
            <TabsList className="w-full">
                {tabs.map((tab) => {
                    const Icon = tab.icon

                    return (
                        <TabsTrigger
                            key={tab.value}
                            value={tab.value}
                            className="flex-1"
                        >
                            <Icon className="size-4"/>
                            {tab.label}
                        </TabsTrigger>
                    )
                })}
            </TabsList>

            {tabs.map((tab) => (
                <TabsContent key={tab.value} value={tab.value} className="w-full">
                    {tab.content}
                </TabsContent>
            ))}
        </Tabs>
    )
}