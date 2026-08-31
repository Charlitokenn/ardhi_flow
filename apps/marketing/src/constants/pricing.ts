export interface PricingPlan {
    name: string;
    priceUSD: {
        monthly: string;
        yearly: string;
    };
    priceTZS: string;
    period: string;
    blurb: string;
    features: string[];
    featured: boolean;
}

export const pricingPlans: PricingPlan[] = [
    {
        name: "Do It Yourself",
        priceUSD: {
            monthly: "20",
            yearly: "216",
        },
        priceTZS: "217,000",
        period: "/Year",
        blurb:
            "For businesses on a budget and are confident in following the documentations",
        features: [
            "Usage on up to 2 devices.",
            "Double entry accounting",
            "Inventory management",
            "Stock level mobile notifications",
            "Barcode scanner integration",
            "Daily backups & latest 7 days recovery",
            "Whatsapp support & documentations",
        ],
        featured: false,
    },
    {
        name: "Done For You",
        priceUSD: {
            monthly: "49",
            yearly: "540",
        },
        priceTZS: "397,000",
        period: "/Year",
        blurb:
            "For businesses that need everything setup for them, so they can focus on daily operations",
        features: [
            "Usage on up to 5 devices.",
            "Everything on Do It Yourself plan",
            "All business records digitized for you",
            "One-time data import",
            "Over the shoulder software training",
            "Daily backups & latest 21 days recovery",
            "Priority support",
        ],
        featured: true,
    },
    {
        name: "RareBooks Desktop",
        priceUSD: {
            monthly: "1,490",
            yearly: "1,490",
        },
        priceTZS: "1,697,000",
        period: "Forever",
        blurb: "One-time purchase, yours forever",
        features: [
            "For Windows only",
            "100% offline operation – Works without internet",
            "All features unlocked forever – no limits",
            " CSV import/export with Web Version",
            "3 years of updates included",
            "Only applies to Desktop App, Web Version not included",
        ],
        featured: false,
    },
];

export function getCurrencySymbol(countryCode: string): string {
    return countryCode === "TZ" ? "TZS " : "$";
}

export function getPrice(plan: PricingPlan, countryCode: string): string {
    if (plan.priceUSD.monthly && plan.priceUSD.yearly === "Custom")
        return "Custom";
    return countryCode === "TZ"
        ? plan.priceTZS
        : [plan.priceUSD.monthly, plan.priceUSD.yearly];
}

export function isTanzania(countryCode: string): boolean {
    return countryCode === "TZ";
}

// A plan whose monthly and yearly USD prices are identical is a one-time /
// fixed-price plan (e.g. RareBooks Desktop). These plans should never show
// a "/Month", "/Year", or any other period suffix next to the price, and
// should not change when the monthly/yearly toggle is flipped.

export function isOneTime(plan: PricingPlan): boolean {
    return plan.priceUSD.monthly === plan.priceUSD.yearly;
}
