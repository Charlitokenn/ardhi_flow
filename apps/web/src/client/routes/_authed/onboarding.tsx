import { createFileRoute, redirect } from '@tanstack/react-router'
import { OrganizationList } from '@clerk/react'
import { useEffect } from 'react'
import { usePostHog } from 'posthog-js/react'

export const Route = createFileRoute('/_authed/onboarding')({
    beforeLoad: ({ context }) => {
        // Already has an active org — nothing to onboard, send them in.
        if (context.auth.orgId) {
            throw redirect({ to: '/dashboard' })
        }
    },
    component: OnboardingPage,
})

function OnboardingPage() {
    const posthog = usePostHog()

    useEffect(() => {
        posthog.capture('onboarding_viewed')
    }, [posthog])

    return (
        <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-4">
            <div className="text-center">
                <h1 className="text-lg font-semibold">Choose a workspace</h1>
                <p className="text-sm text-muted-foreground">
                    Select an existing organization or create a new one to continue.
                </p>
            </div>
            <OrganizationList
                hidePersonal
                afterSelectOrganizationUrl="/dashboard"
                afterCreateOrganizationUrl="/dashboard"
            />
        </div>
    )
}
