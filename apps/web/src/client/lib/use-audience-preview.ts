import {useEffect, useState} from "react"
import {useAuth} from "@clerk/react"
import {useQuery} from "@tanstack/react-query"
import {apiClient} from "@/lib/api.ts"
import type {ComposeCampaign} from "@/components/messaging/compose-campaign.ts"

// POST /api/campaigns/audience-preview for the compose flow's current,
// possibly unsaved rules (docs/specs/0004-sms-send-flow AC-6, AC-7). The
// audience step, the send step and the side panel share one cached result.
// Errors come back as data (code + message) rather than a thrown query
// error, so each step can show why there is no preview.
export function useAudiencePreview(campaign: ComposeCampaign, enabled: boolean) {
    const {getToken} = useAuth()
    const api = apiClient(getToken)

    const input = {
        type: campaign.smsType,
        templateId: campaign.templateId,
        templateBody: campaign.message,
        audience: campaign.audience,
    }
    const key = JSON.stringify(input)
    const [debouncedKey, setDebouncedKey] = useState(key)
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedKey(key), 400)
        return () => clearTimeout(timer)
    }, [key])

    return useQuery({
        queryKey: ["audience-preview", debouncedKey],
        enabled: enabled && campaign.type === "sms" && campaign.message.trim() !== "",
        // Cost and balance change underneath, so never treat an old answer as fresh.
        staleTime: 0,
        queryFn: async () => {
            const res = await api.api.campaigns["audience-preview"].$post({
                json: JSON.parse(debouncedKey) as typeof input,
            })
            const body: unknown = await res.json().catch(() => null)
            if (!res.ok) {
                const record = (body && typeof body === "object" ? body : {}) as Record<string, unknown>
                return {
                    ok: false as const,
                    code: typeof record.error === "string" ? record.error : "error",
                    message: typeof record.message === "string" ? record.message : "Could not work out the audience",
                }
            }
            return {ok: true as const, data: body as AudiencePreview}
        },
    })
}

export interface AudiencePreview {
    recipients: { contactId: string; name: string; phone: string }[]
    skipped: { contactId: string; name: string; reason: "optedOut" | "nothingDue" | "noValidNumber" | "duplicateNumber" | "tooLong" }[]
    skippedCounts: Record<"optedOut" | "nothingDue" | "noValidNumber" | "duplicateNumber" | "tooLong", number>
    totalSegments: number
    estimatedCost: number
    balance: { smsBalance: number; display: string }
    balanceSufficient: boolean
}
