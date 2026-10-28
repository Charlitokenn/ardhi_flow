import {useAuth} from "@clerk/react"
import {useQuery} from "@tanstack/react-query"
import {apiClient} from "@/lib/api.ts"

// Shared with the SMS settings page and the send step, so a save there
// clears this notice without a manual refetch.
export function useSmsSettings() {
    const {getToken} = useAuth()
    const api = apiClient(getToken)
    return useQuery({
        queryKey: ["sms-settings"],
        queryFn: async () => {
            const res = await api.api["sms-settings"].$get()
            if (!res.ok) throw new Error(`Failed to load SMS settings (${res.status})`)
            return res.json()
        },
    })
}
