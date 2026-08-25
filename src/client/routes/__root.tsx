import {createRootRouteWithContext, Outlet} from '@tanstack/react-router'
import {ReactQueryDevtools} from '@tanstack/react-query-devtools'
import type {QueryClient} from '@tanstack/react-query'
import {ThemeProvider} from '@/components/theme-provider.tsx'
import type {RouterAuthContext} from '../router.tsx'
import {useUser} from '@clerk/react'
import {useEffect} from 'react'
import {PostHogProvider, usePostHog} from 'posthog-js/react'

const POSTHOG_KEY = import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN
const POSTHOG_HOST = import.meta.env.VITE_PUBLIC_POSTHOG_HOST

if (import.meta.env.DEV && !POSTHOG_KEY) {
    console.error(
        'VITE_PUBLIC_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, ' +
        'this causes events to be silently missed. This error stops appearing once VITE_PUBLIC_POSTHOG_PROJECT_TOKEN is configured',
    )
}

export interface RouterContext {
    auth: RouterAuthContext
    queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
    component: RootComponent,
})

/** Identifies the signed-in Clerk user in PostHog whenever their session changes. */
function PostHogIdentifier() {
    const {user, isLoaded} = useUser()
    const posthog = usePostHog()

    useEffect(() => {
        if (!isLoaded) return
        if (user) {
            posthog.identify(user.id, {
                name: user.fullName,
                role: user.organizationMemberships?.[0]?.role,
            })
        } else {
            posthog.reset()
        }
    }, [user, isLoaded, posthog])

    return null
}

function RootComponent() {
    return (
        <PostHogProvider
            apiKey={POSTHOG_KEY ?? ''}
            options={{
                api_host: '/ingest',
                ui_host: POSTHOG_HOST ? POSTHOG_HOST.replace('.i.posthog', '.posthog') : undefined,
                defaults: '2026-01-30',
                capture_exceptions: true,
                debug: import.meta.env.DEV,
                before_send: (event) => (import.meta.env.DEV ? null : event),
            }}
        >
            <PostHogIdentifier/>
            <ThemeProvider defaultTheme="dark" storageKey="ardhiflow-ui-theme">
                <Outlet/>
                {import.meta.env.DEV && (
                    <>
                        {/*<TanStackRouterDevtools position="bottom-right"/>*/}
                        <ReactQueryDevtools buttonPosition="bottom-left"/>
                    </>
                )}
            </ThemeProvider>
        </PostHogProvider>
    )
}
