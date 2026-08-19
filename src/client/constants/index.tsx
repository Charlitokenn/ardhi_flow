import {
    ArchiveIcon,
    FileChartColumnIcon,
    LayoutPanelLeftIcon,
    MessagesSquareIcon,
    ShoppingCartIcon,
    UsersIcon,
    WalletIcon
} from "lucide-react";

export const appConfig = {
    name: "ArdhiFlow",
    description: "ArdhiFlow",
    version: "1.0",
    supportEmail: "support@ardhiflow.com",
    sidebarMenu: [
        {
            title: "Dashboard",
            url: "/dashboard",
            icon: <LayoutPanelLeftIcon/>,
        },
        {
            title: "Contacts",
            url: "/contacts",
            icon: <UsersIcon/>,
        },
        {
            title: "Daily Sales",
            url: "/sales",
            icon: <ShoppingCartIcon/>,
        },
        {
            title: "Finance",
            url: "",
            icon: <WalletIcon/>,
            items: [
                {
                    title: "Transactions",
                    url: "/finance/transactions",
                },
                {
                    title: "Reminder",
                    url: "/finance/reminder",
                },
                {
                    title: "Commissions",
                    url: "/finance/commissions",
                },
                {
                    title: "Reconciliation",
                    url: "/finance/reconciliation",
                },
            ],
        },
        {
            title: "Projects",
            url: "/projects",
            icon: <ArchiveIcon/>,
        },
        {
            title: "Messaging",
            url: "/messaging",
            icon: <MessagesSquareIcon/>,
        },
        {
            title: "Reports",
            url: "/reports",
            icon: <FileChartColumnIcon/>,
        },
    ]
}