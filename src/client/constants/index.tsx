import {BotIcon, TerminalSquareIcon} from "lucide-react";

export const appConfig = {
    name: "ArdhiFlow",
    description: "ArdhiFlow",
    version: "1.0",
    supportEmail: "support@ardhiflow.com",
    sidebarMenu: [
        {
            title: "Dashboard",
            url: "/dashboard",
            icon: (
                <TerminalSquareIcon />
            ),
        },
        {
            title: "Finance",
            url: "",
            icon: (
                <BotIcon
                />
            ),
            items: [
                {
                    title: "Transactions",
                    url: "/finance/transactions",
                },
                {
                    title: "Reconciliation",
                    url: "/finance/reconciliation",
                },
            ],
        },
    ]
}