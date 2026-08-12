import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed')({
    beforeLoad: ({ context }) => {
        if (!context.auth.isSignedIn) {
            throw redirect({ to: '/sign-in/$', params: { _splat: '' } })
        }
    },
    component: Outlet,
})
