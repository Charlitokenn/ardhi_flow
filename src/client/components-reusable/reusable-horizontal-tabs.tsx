import {type LucideIcon} from "lucide-react"
import {type ReactNode} from "react"

import {Tabs, TabsContent, TabsList, TabsTrigger,} from "@/components/ui/tabs"

interface HorizontalTabItem {
    value: string;
    label: string;
    icon: LucideIcon;
    content: ReactNode;
}

interface HorizontalTabsProps {
    tabs: HorizontalTabItem[];
    defaultValue?: string;
    className?: string;
}

export default function HorizontalTabs({
                                           tabs,
                                           defaultValue,
                                           className = "",
                                       }: HorizontalTabsProps) {
    const defaultTab = defaultValue || tabs[0]?.value

    return (
        <Tabs defaultValue={defaultTab} className={`items-center ${className}`}>
            <TabsList className="h-auto rounded-none border-b bg-transparent p-0">
                {tabs.map((tab) => {
                    const Icon = tab.icon
                    return (
                        <TabsTrigger
                            key={tab.value}
                            value={tab.value}
                            className="relative flex-col rounded-none px-4 py-2 text-xs after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:after:bg-primary"
                        >
                            <Icon
                                className="mb-1.5 opacity-60"
                                size={16}
                                aria-hidden="true"
                            />
                            {tab.label}
                        </TabsTrigger>
                    )
                })}
            </TabsList>
            {tabs.map((tab) => (
                <TabsContent key={tab.value} value={tab.value}>
                    {tab.content}
                </TabsContent>
            ))}
        </Tabs>
    )
}

// Example usage:
/*
import { BoxIcon, HouseIcon, PanelsTopLeftIcon } from "lucide-react"
import ReusableTabs, { TabItem } from "./ReusableTabs"

const tabsData: TabItem[] = [
  {
    value: "tab-1",
    label: "Overview",
    icon: HouseIcon,
    content: (
      <p className="p-4 text-center text-xs text-muted-foreground">
        Content for Tab 1
      </p>
    ),
  },
  {
    value: "tab-2",
    label: "Project",
    icon: PanelsTopLeftIcon,
    content: (
      <p className="p-4 text-center text-xs text-muted-foreground">
        Content for Tab 2
      </p>
    ),
  },
  {
    value: "tab-3",
    label: "Packages",
    icon: BoxIcon,
    content: (
      <p className="p-4 text-center text-xs text-muted-foreground">
        Content for Tab 3
      </p>
    ),
  },
]

function App() {
  return <ReusableTabs tabs={tabsData} defaultValue="tab-1" />
}
*/