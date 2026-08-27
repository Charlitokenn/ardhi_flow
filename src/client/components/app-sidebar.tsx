import * as React from "react";

import {NavMain} from "@/components/nav-main";
import {TeamSwitcher} from "@/components/team-switcher";
import {Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarRail,} from "@/components/ui/sidebar";
import {appConfig} from "@/constants";
import {SMSUsageTracker} from "@/components/sms-usage-tracker.tsx";

export function AppSidebar({...props}: React.ComponentProps<typeof Sidebar>) {
    return (
        <Sidebar collapsible="icon" {...props}>
            <SidebarHeader>
                <TeamSwitcher/>
            </SidebarHeader>
            <SidebarContent>
                <NavMain items={appConfig.sidebarMenu}/>
            </SidebarContent>
            <SidebarFooter>
                <SMSUsageTracker/>
            </SidebarFooter>
            <SidebarRail/>
        </Sidebar>
    );
}
