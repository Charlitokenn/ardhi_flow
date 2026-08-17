# ArdhiFlow — UI Rules

These rules apply to every UI file. The agent must follow them without exception.

## Color & Theming

- ✅ DO: Use the mapped Tailwind classes from `ui-tokens.md` — `bg-primary`, `text-muted-foreground`, `border-border`, etc.
- ❌ NEVER: Use raw hex values or arbitrary Tailwind values like `text-[#3B82F6]` — this is a Tailwind v4 project with no config file, so every color must resolve through the `@theme inline` mapping in `index.css`.
- ✅ Dark mode: handled by `next-themes` + the `.dark` class scope (`mode-toggle.tsx` is the existing toggle) — tokens auto-switch, don't write manual `dark:` overrides unless a specific component genuinely needs a value that isn't already token-driven.
- Status/semantic colors (`success`, `warning`, `info`, `destructive`) are dedicated tokens, not a generic "green/yellow/blue" — use them by name (`text-success`, `bg-warning`) so meaning stays consistent across the app.

## Layout

- The app shell is a `Sidebar` (`collapsible="icon"`) + main content area, defined in `app-sidebar.tsx` and the `_org/route.tsx` pathless layout. New authenticated pages go under `_authed/_org/` to inherit this shell automatically.
- Page headers follow the pattern seen in `plots.tsx`: an `<h1 className="text-lg font-semibold">` title with a `<p className="text-sm text-muted-foreground">` one-line description directly beneath it.
- Use `pageHero.tsx` for any page that needs a larger hero-style header treatment beyond the plain h1/p pattern above.

## Typography

- All body/UI text uses `font-sans` (Ubuntu) — set globally in `index.css`, no per-component font-family overrides.
- Page titles: `text-lg font-semibold`. Section descriptions: `text-sm text-muted-foreground`. Follow existing route files for the exact scale rather than inventing new sizes.

## Components

- **Check `ui-registry.md` and the `ui/`, `reui/`, `billingsdk/`, `data-grids/`, `components-reusable/` folders before building anything new** — this project pulls from four shadcn-compatible registries (`shadcn`, `@diceui`, `@reui`, `@billingsdk`) via the CLI, so a lot of primitives already exist or are one `npx shadcn add` away.
- Registry-pulled files sometimes carry a stray `"use client"` directive at the top (e.g. `reui/phone-input.tsx`) — this is a harmless no-op in this plain Vite SPA (there's no server/client component split to mark), not a signal to restructure anything. Leave it as-is rather than stripping it, so future `npx shadcn add`/registry updates don't produce a spurious diff.
- Data tables use TanStack Table via the `reui/data-grid` wrapper — see `contacts-datagrid.tsx` / `contracts-datagrid.tsx` / `projects-datagrid.tsx` / `transactions-datagrid.tsx` as the pattern, and `datagrid-template.tsx` as the starting scaffold for a new one. Don't build a bespoke table from raw `<table>` markup.
- Empty states use `components-reusable/reusable-empty.tsx`. Stats/metric tiles use `reusable-stats.tsx`. Bulk-action bars on tables use `reusable-table-action-bar.tsx`. Reuse these rather than one-off equivalents.
- Toasts: `sonner`'s `<Toaster />` is mounted once in `main.tsx` — call `toast(...)` from `sonner` directly, don't add a second toast system.
- Tooltips: a single `TooltipProvider` wraps the app in `main.tsx` — use the shadcn `Tooltip`/`reusable-tooltip.tsx` components, don't nest another provider.
- Loading state: `components/loader.tsx` is the shared loading spinner/skeleton entry point (used while Clerk is loading in `main.tsx`); prefer it over ad hoc spinners.
- Register every new component in `ui-registry.md` immediately after building it.

## Forms

- **Still no form library** (no `react-hook-form`) — forms remain plain controlled components with `useState`, submitted via a TanStack Query `useMutation` that calls the typed Hono RPC client. This hasn't changed. What *has* changed: complex, multi-field forms now validate client-side with hand-written `zod` schemas instead of skipping client validation entirely.
- **Two live reference patterns depending on form complexity:**
  - **Simple, single-step forms** (a handful of fields, one screen): follow `plots.tsx`'s `NewPlotForm` — plain `useState`, no client-side schema, rely on the server's `zValidator` for real validation.
  - **Complex, multi-step forms**: follow `add-edit-contact-form.tsx` — per-step `zod` object schemas (e.g. `contactInfoSchema`, `addressSchema`, `emergencySchema`), the `Stepper`/`StepperNav`/`StepperPanel` primitives from `reui/stepper.tsx`, and a single component handling both `mode="add"` and `mode="edit"` rather than two near-duplicate components. Use this pattern once a resource's create form has more than ~6-8 fields or naturally splits into logical sections.
- **`UNSET` sentinel for optional Radix `Select`s**: Radix's `Select.Item` rejects an empty-string `value`, so an unset optional select field uses a sentinel constant (`const UNSET = "UNSET"`) instead of `""`, normalized back to `""` before zod validation / API submission. Reuse this exact pattern (don't invent a different sentinel) for any new optional `Select` field.
- **Self-closing sheets**: a form rendered inside a `ReusableSheet`'s `formContent` can close its own sheet after a successful save via `useSheetControl()` (`components-reusable/reusable-sheet.tsx`) rather than requiring the parent to manage `open` state and coordinate a callback. Prefer this over threading an `onOpenChange` callback down through props for new sheet-hosted forms.
- Server-side validation remains the real safety net regardless of whether a form validates client-side: every mutating route validates its input with `zValidator('json', schema)` where `schema` is `drizzle-zod`'s `createInsertSchema(table)` (see any file in `src/worker/routes/`). Client-side `zod` checks are a UX improvement (fail fast, per-step errors), not a replacement for the server check.
- Disable the submit button and show a pending state while the mutation's `isPending` is true (see `createPlot.isPending` in `NewPlotForm`, or the submit handling in `AddEditContactForm`).
- Phone number fields use `PhoneInput` (`reui/phone-input.tsx`), not a plain `Input` — it handles country code + formatting via `react-phone-number-input`.

## Data Fetching & Mutations (UI-facing)

- Every data-fetching component uses `useQuery`/`useMutation` from TanStack Query, calling through `apiClient(getToken)` from `@/lib/api.ts` — never a raw `fetch('/api/...')`.
- On successful mutations, call `queryClient.invalidateQueries({ queryKey: [...] })` for the affected resource rather than manually patching cached data.
- Capture a PostHog event (`posthog.capture('resource_action', {...})`) on meaningful create/update/delete mutations and their failure paths — see `plot_created` / `plot_creation_failed` in `plots.tsx` as the pattern. This feeds the PostHog Self-driving conversion-funnel monitoring already configured for this project.

## Responsive Design

- `use-mobile.ts` provides the mobile breakpoint hook already in use by the sidebar (collapses to a slide-over on mobile, per `SCAFFOLD_NOTES.md`). Reuse it rather than a new `matchMedia` check.
- Default to Tailwind's standard breakpoints (`sm`/`md`/`lg`/`xl`) — no custom breakpoint scale is defined in this project.

## Accessibility

- Icon-only buttons need `aria-label` — this is not yet consistently enforced across the codebase, so treat it as a standard to hold new code to, not an assumption about existing code.
- Rely on Radix primitives (via shadcn/ui) for focus management and keyboard interaction on dialogs, dropdowns, and menus rather than reimplementing it.

## Forbidden Patterns

- ❌ Inline styles (`style={{ }}`) — use Tailwind classes instead.
- ❌ Arbitrary Tailwind values when a token-based class exists.
- ❌ Hand-rolled `fetch()` calls to `/api/*` — always go through `apiClient` for full type safety.
- ❌ Editing `src/client/routeTree.gen.ts` directly — it's regenerated by the TanStack Router Vite plugin.
- ❌ Editing files under `components/ui/` directly — regenerate/update via the shadcn CLI so registry updates stay clean.
