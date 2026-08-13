import type {DashboardData, SalesCollectionPoint} from "@/types/dashboard-types";

const createMonthDate = (monthIndex: number, day = 1): Date => {
    return new Date(2026, monthIndex, day)
}

export const allSalesCollectionsData: SalesCollectionPoint[] = [
    { month: "Mar", date: createMonthDate(2), sales: 62_000_000, collections: 27_000_000 },
    { month: "Apr", date: createMonthDate(3), sales: 71_000_000, collections: 29_500_000 },
    { month: "May", date: createMonthDate(4), sales: 68_000_000, collections: 31_000_000 },
    { month: "Jun", date: createMonthDate(5), sales: 79_000_000, collections: 33_500_000 },
    { month: "Jul", date: createMonthDate(6), sales: 74_000_000, collections: 30_200_000 },
    { month: "Aug", date: createMonthDate(7), sales: 84_500_000, collections: 31_800_000 },
]

export const dashboardData: DashboardData = {
    metrics: {
        sales: 84_500_000,
        salesChange: 12.4,
        collections: 31_800_000,
        collectionsChange: 8.2,
        receivables: 426_700_000,
        activeClients: 128,
        overdue: 47_200_000,
        overdueClients: 34,
        amountDue: 40_000_000,
        collectionRate: 79.5,
    },
    salesCollections: allSalesCollectionsData,
    receivablesAging: [
        { label: "Current", amount: 379_000_000 },
        { label: "1–30 days", amount: 18_000_000 },
        { label: "31–60 days", amount: 12_000_000 },
        { label: "61–90 days", amount: 8_000_000 },
        { label: "90+ days", amount: 9_000_000 },
    ],
    paymentFollowUp: [
        {
            id: "1",
            client: "John Mwangi",
            plot: "KIBAHA-024",
            dueDate: "10 Aug 2026",
            amount: 450_000,
            status: "Overdue",
        },
        {
            id: "2",
            client: "Asha Mushi",
            plot: "VIKURUTI-118",
            dueDate: "15 Aug 2026",
            amount: 600_000,
            status: "Due Soon",
        },
        {
            id: "3",
            client: "Peter John",
            plot: "KIBAHA-091",
            dueDate: "18 Aug 2026",
            amount: 350_000,
            status: "Due Soon",
        },
        {
            id: "4",
            client: "Grace Joseph",
            plot: "BOKO-042",
            dueDate: "08 Aug 2026",
            amount: 750_000,
            status: "Overdue",
        },
        {
            id: "5",
            client: "Michael Daniel",
            plot: "VIKURUTI-076",
            dueDate: "12 Aug 2026",
            amount: 500_000,
            status: "Overdue",
        },
        {
            id: "6",
            client: "Esther Michael",
            plot: "KIBAHA-055",
            dueDate: "20 Aug 2026",
            amount: 425_000,
            status: "Due Soon",
        },
        {
            id: "7",
            client: "David Peter",
            plot: "BOKO-019",
            dueDate: "05 Aug 2026",
            amount: 800_000,
            status: "Overdue",
        },
    ],
}