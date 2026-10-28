import {type HorizontalTabItem, ReusableHorizontalTabs,} from "@/components-reusable/reusable-horizontal-tabs.tsx";
import {BrandingSettingsForm} from "@/components/forms/company/branding-settings-form.tsx";
import {SmsSettingsForm} from "@/components/forms/company/sms-settings-form.tsx";
import {MessageSquareTextIcon, PaletteIcon} from "lucide-react";
import type {OrganizationSettingsTab} from "@/lib/organization-settings-events.ts";

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
        value: "sms",
        label: "SMS",
        icon: MessageSquareTextIcon,
        content: (
            <section className="mt-2">
                <SmsSettingsForm/>
            </section>
        ),
    },
];

const OrganizationSettings = ({defaultTab = "branding"}: { defaultTab?: OrganizationSettingsTab }) => {
    return (
        <section>
            <h1 className="text-base mb-2 font-bold">Settings</h1>
            <ReusableHorizontalTabs tabs={settingsTabData} defaultValue={defaultTab}/>
        </section>
    );
};
export default OrganizationSettings;
