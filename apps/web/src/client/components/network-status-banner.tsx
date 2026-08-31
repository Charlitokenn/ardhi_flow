import { useEffect, useState } from "react"
import { WifiOff } from "lucide-react"

const HEALTH_CHECK_INTERVAL = 15_000
const HEALTH_ENDPOINT = "/api/health"

async function checkServerConnection(): Promise<boolean> {
    try {
        const response = await fetch(HEALTH_ENDPOINT, {
            method: "GET",
            cache: "no-store",
            credentials: "same-origin",
        })

        return response.ok
    } catch {
        return false
    }
}

export function NetworkStatusBanner() {
    const [isOffline, setIsOffline] = useState(() => !navigator.onLine)

    useEffect(() => {
        let mounted = true

        const checkConnection = async () => {
            if (!navigator.onLine) {
                if (mounted) {
                    setIsOffline(true)
                }
                return
            }

            const serverReachable = await checkServerConnection()

            if (mounted) {
                setIsOffline(!serverReachable)
            }
        }

        const handleOffline = () => {
            setIsOffline(true)
        }

        const handleOnline = () => {
            // Browser says we're online, but verify the actual application server.
            void checkConnection()
        }

        window.addEventListener("offline", handleOffline)
        window.addEventListener("online", handleOnline)

        // Verify initial connectivity.
        void checkConnection()

        const intervalId = window.setInterval(
            checkConnection,
            HEALTH_CHECK_INTERVAL
        )

        return () => {
            mounted = false

            window.removeEventListener("offline", handleOffline)
            window.removeEventListener("online", handleOnline)
            window.clearInterval(intervalId)
        }
    }, [])

    if (!isOffline) {
        return null
    }

    return (
        <div
            role="alert"
            aria-live="assertive"
            className="flex shrink-0 items-center justify-center gap-2 border-b border-warning/20 bg-warning/30 px-4 py-1 text-xs dark:text-white"
        >
            <WifiOff className="size-4 shrink-0" />

            <span>
        You are offline. Some features may not be available until your
        connection is restored.
      </span>
        </div>
    )
}