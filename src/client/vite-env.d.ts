/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLERK_PUBLISHABLE_KEY: string
  readonly VITE_PUBLIC_POSTHOG_PROJECT_TOKEN: string | undefined
  readonly VITE_PUBLIC_POSTHOG_HOST: string | undefined
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
