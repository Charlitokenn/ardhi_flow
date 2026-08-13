import { useEffect, useState } from "react"
import { WifiOff } from "lucide-react"

const CONNECTIVITY_CHECK_INTERVAL = 15_000

async function canReachServer() {
  try {
    await fetch(window.location.origin, {
      method: "HEAD",
      cache: "no-store",
      credentials: "same-origin",
    })
    return true
  } catch {
    return false
  }
}

export function NetworkStatusBanner() {
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine)

  useEffect(() => {
    const handleOffline = () => setIsOffline(true)
    const handleOnline = async () => {
      setIsOffline(!(await canReachServer()))
    }

    const checkConnectivity = async () => {
      if (!navigator.onLine) {
        setIsOffline(true)
        return
      }

      setIsOffline(!(await canReachServer()))
    }

    window.addEventListener("offline", handleOffline)
    window.addEventListener("online", handleOnline)

    checkConnectivity()
    const interval = window.setInterval(checkConnectivity, CONNECTIVITY_CHECK_INTERVAL)

    return () => {
      window.removeEventListener("offline", handleOffline)
      window.removeEventListener("online", handleOnline)
      window.clearInterval(interval)
    }
  }, [])

  if (!isOffline) {
    return null
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex shrink-0 items-center justify-center gap-2 border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive"
    >
      <WifiOff className="size-4 shrink-0" />
      <span>
        You are offline. Some features may not be available until your internet
        connection is restored.
      </span>
    </div>
  )
}
