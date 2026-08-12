import {
    ArchiveIcon,
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
            icon: <LayoutPanelLeftIcon />,
        },
        {
            title: "Contacts",
            url: "/contacts",
            icon: <UsersIcon />,
        },
        {
            title: "Daily Sales",
            url: "/sales",
            icon: <ShoppingCartIcon />,
        },
        {
            title: "Finance",
            url: "",
            icon: <WalletIcon />,
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
                    title: "Reconciliation",
                    url: "/finance/reconciliation",
                },
            ],
        },
        {
            title: "Projects",
            url: "",
            icon: <ArchiveIcon/> ,
            items: [
                {
                    title: "Projects List",
                    url: "/projects/projects-list",
                },
                {
                    title: "Payments",
                    url: "/projects/payments",
                },
            ],
        },
        {
            title: "Messaging",
            url: "/messaging",
            icon: <MessagesSquareIcon />,
        },

    ]
}