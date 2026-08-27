import {type HorizontalTabItem, ReusableHorizontalTabs,} from "@/components-reusable/reusable-horizontal-tabs.tsx";
import {BrandingSettingsForm} from "@/components/forms/company/branding-settings-form.tsx";
import {CreditCardIcon, LandmarkIcon, MessageSquareIcon, PaletteIcon} from "lucide-react";

const settingsTabData: HorizontalTabItem[] = [
    {
        value: "branding",
        label: "Branding",
        icon: PaletteIcon,
        content: (
            <section className="mt-2">
                <BrandingSettingsForm/>
            </section>
        ),
    },
    {
        value: "billing-and-subscription",
        label: "Billing & Subscription",
        icon: CreditCardIcon,
        content: "",
    },
    {
        value: "messaging",
        label: "Messaging",
        icon: MessageSquareIcon,
        content: "",
    },
    {
        value: "accounts",
        label: "Accounts",
        icon: LandmarkIcon,
        content: "",
    },
];

const OrganizationSettings = () => {
    return (
        <section>
            <h1 className="text-base mb-2 font-bold">Settings</h1>
            <ReusableHorizontalTabs tabs={settingsTabData} defaultValue="branding"/>
        </section>
    );
};
export default OrganizationSettings;
