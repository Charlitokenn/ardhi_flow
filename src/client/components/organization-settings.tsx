import {type HorizontalTabItem, ReusableHorizontalTabs,} from "@/components-reusable/reusable-horizontal-tabs.tsx";
import {BrandingSettingsForm} from "@/components/forms/company/branding-settings-form.tsx";
import {PaletteIcon} from "lucide-react";

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
