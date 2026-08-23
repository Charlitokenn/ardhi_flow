import {Tabs, TabsContent, TabsList, TabsTrigger,} from "@/components/ui/tabs";
import type {LucideIcon} from "lucide-react";

export type HorizontalTabItem = {
    label: string;
    id: string;
    icon: LucideIcon;
    content: React.ReactNode;
};

type TabsWithIconProps = {
    tabs: HorizontalTabItem[];
    defaultTab?: string;
    className?: string;
};

export const CustomTabsHorizontal = ({
                                         tabs,
                                         defaultTab = "tab-1",
                                         className = "w-full max-w-md",
                                     }: TabsWithIconProps) => {
    return (
        <div className={className}>
            <Tabs defaultValue={defaultTab ?? tabs[0]?.id} className="gap-4" orientation="horizontal">
                <TabsList>
                    {tabs.map(({icon: Icon, label, id}) => (
                        <TabsTrigger
                            key={id}
                            value={id}
                            className="flex items-center gap-1 px-2.5 sm:px-3"
                        >
                            <Icon/>
                            {label}
                        </TabsTrigger>
                    ))}
                </TabsList>
                {tabs.map((tab) => (
                    <TabsContent key={tab.id} value={tab.id} className="w-245">
                        <p className="text-muted-foreground text-sm">{tab.content}</p>
                    </TabsContent>
                ))}
            </Tabs>
        </div>
    );
};

export default CustomTabsHorizontal;