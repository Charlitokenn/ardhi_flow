# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Context (added by /audit, 2026-09)

- `@ardhiflow/mobile`: Expo SDK 57 app. It consumes `@ardhiflow/api-client` and `@ardhiflow/shared-schema`, and types its API calls against `AppType` imported from `@ardhiflow/web/worker` (a types-only export).
- Auth uses `@clerk/expo`. Unlike web there is no same-origin, so `EXPO_PUBLIC_API_URL` must be set in the app's `.env` or `src/lib/api-client.ts` throws at startup.
- Root `AGENTS.md` rules that still apply here: kebab-case filenames, no hardcoded colors. The tenant middleware and Drizzle rules are Worker side and do not apply.

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
