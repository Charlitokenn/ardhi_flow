import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  beforeLoad: ({ context }) => {
    if (!context.auth.isSignedIn) {
      throw redirect({ to: '/sign-in/$', params: { _splat: '' } })
    }
    if (!context.auth.orgId) {
      throw redirect({ to: '/onboarding' })
    }
    throw redirect({ to: '/dashboard' })
  },
})
