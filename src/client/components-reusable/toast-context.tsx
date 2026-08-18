import {createContext, ReactNode, useCallback, useContext, useState} from 'react'
import {ToastProvider, ToastViewport} from "@/components/ui/toast"
import CustomToast from './custom-toast'

interface ToastOptions {
    title: string
    description?: string
    duration?: number
    variant?: "default" | "success" | "error" | "warning"
    showAction?: boolean
    actionLabel?: string
    onAction?: () => void
}

interface ToastContextType {
    showToast: (options: ToastOptions) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function ToastContextProvider({children}: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Array<ToastOptions & { id: number }>>([])

    const showToast = useCallback((options: ToastOptions) => {
        const id = Date.now() + Math.random() // Ensure unique ID
        setToasts((prev) => [...prev, {...options, id}])
    }, [])

    const removeToast = useCallback((id: number) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id))
    }, [])

    return (
        <ToastContext.Provider value={{showToast}
        }>
            <ToastProvider swipeDirection="right">
                {children}
                {
                    toasts.map((toast) => (
                        <CustomToast
                            key={toast.id}
                            title={toast.title}
                            description={toast.description}
                            duration={toast.duration}
                            variant={toast.variant}
                            showAction={toast.showAction}
                            actionLabel={toast.actionLabel}
                            onAction={toast.onAction}
                            onClose={() => removeToast(toast.id)}
                            autoOpen={true}
                        />
                    ))}
                {/* Positioned by ToastViewport in components/ui/toast.tsx */}
                <ToastViewport/>
            </ToastProvider>
        </ToastContext.Provider>
    )
}

export function useToast() {
    const context = useContext(ToastContext)
    if (!context) {
        throw new Error('useToast must be used within ToastContextProvider')
    }
    return context
}