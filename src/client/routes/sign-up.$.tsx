import { createFileRoute, redirect } from '@tanstack/react-router'
import { SignUp } from '@clerk/react'

export const Route = createFileRoute('/sign-up/$')({
  beforeLoad: ({ context }) => {
    if (context.auth.isSignedIn) {
      throw redirect({ to: '/' })
    }
  },
  component: SignUpPage,
})

function SignUpPage() {
  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" />
    </div>
  )
}
