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
    defaultValue?: string;
    className?: string;
};

const CustomTabsHorizontal = ({
                                  tabs,
                                  defaultValue = "tab-1",
                                  className = "w-full max-w-md",
                              }: TabsWithIconProps) => {
    return (
        <div className={className}>
            <Tabs defaultValue={defaultValue ?? tabs[0]?.id} className="gap-4" orientation="horizontal">
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
                    <TabsContent key={tab.id} value={tab.id}>
                        <p className="text-muted-foreground text-sm">{tab.content}</p>
                    </TabsContent>
                ))}
            </Tabs>
        </div>
    );
};

export default CustomTabsHorizontal;