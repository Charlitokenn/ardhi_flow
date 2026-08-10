import { createFileRoute, redirect } from '@tanstack/react-router'
import { SignIn } from '@clerk/react'

export const Route = createFileRoute('/sign-in/$')({
  beforeLoad: ({ context }) => {
    // Already signed in — nothing to do here, let "/" sort out where to go.
    if (context.auth.isSignedIn) {
      throw redirect({ to: '/' })
    }
  },
  component: SignInPage,
})

function SignInPage() {
  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" />
    </div>
  )
}
