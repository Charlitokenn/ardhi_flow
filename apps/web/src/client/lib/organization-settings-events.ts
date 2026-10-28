// Lets any screen open the organization settings dialog (owned by
// team-switcher.tsx, which has no URL of its own) on a given tab. Used by the
// compose flow's "SMS is not set up" notice (docs/specs/0004-sms-send-flow AC-3).

export const OPEN_ORGANIZATION_SETTINGS_EVENT = "ardhiflow:open-organization-settings"

export type OrganizationSettingsTab = "branding" | "sms"

export function openOrganizationSettings(tab: OrganizationSettingsTab) {
    window.dispatchEvent(new CustomEvent<OrganizationSettingsTab>(OPEN_ORGANIZATION_SETTINGS_EVENT, {detail: tab}))
}
