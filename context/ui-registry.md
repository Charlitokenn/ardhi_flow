# ArdhiFlow — UI Component Registry

> **Agent rule**: Before building any UI element, check here first.
> After building any UI element, add it here.

Last updated: 2026-08-17 (post-merge: `feat-implement-contact-form` PR)

---

## How to Add an Entry

```
### ComponentName
- **File**: `path/to/component-name.tsx`
- **Purpose**: One sentence — what it renders and when to use it.
- **Props**: List key props with their types.
- **Used in**: Routes or pages that currently use this component.
- **Notes**: Any gotchas, variants, or important usage rules.
```

> **Note**: unlike a greenfield project, ArdhiFlow already has a working app shell and
> several feature areas built. This registry was seeded from the current codebase
> (`src/client/components/`, `components-reusable/`) rather than starting empty — the
> entries below reflect what genuinely exists today. Keep it current from here on.

---

## Registered Components

### AppSidebar
- **File**: `components/app-sidebar.tsx`
- **Purpose**: The main authenticated app shell sidebar — header (org switcher), nav, rail.
- **Props**: `React.ComponentProps<typeof Sidebar>` (spread through to shadcn's `Sidebar`)
- **Used in**: `_authed/_org/route.tsx` layout
- **Notes**: Sources its nav items from `appConfig.sidebarMenu` in `constants/index.tsx` — add new top-level nav sections there, not by hardcoding in this file.

### NavMain
- **File**: `components/nav-main.tsx`
- **Purpose**: Renders the sidebar nav list, including collapsible sub-menus (e.g. Finance's Transactions/Reminder/Reconciliation).
- **Props**: `items: { title: string; url: string; icon?: ReactNode; items?: { title: string; url: string }[] }[]`
- **Used in**: `AppSidebar`
- **Notes**: Highlights the active route via `useLocation()` path matching; auto-opens the parent group containing the active sub-route.

### TeamSwitcher
- **File**: `components/team-switcher.tsx`
- **Purpose**: Org switcher dropdown in the sidebar header; opens Clerk's organization profile for admins.
- **Props**: none (reads Clerk context directly via `useOrganization`/`useClerk`/`useAuth`)
- **Used in**: `AppSidebar`
- **Notes**: Renders nothing if there's no active organization.

### ModeToggle
- **File**: `components/mode-toggle.tsx`
- **Purpose**: Light/dark theme toggle switch.
- **Props**: none
- **Used in**: app header/sidebar chrome
- **Notes**: Uses the custom `theme-provider.tsx` context (next-themes-based) + a `Swap` primitive, not a plain button.

### ThemeProvider
- **File**: `components/theme-provider.tsx`
- **Purpose**: `next-themes`-backed context provider for light/dark/system theme, consumed by `ModeToggle`.
- **Used in**: app root
- **Notes**: Pairs with the `.dark` class scope defined in `ui-tokens.md`.

### NetworkStatusBanner
- **File**: `components/network-status-banner.tsx`
- **Purpose**: Polls `/api/health` every 15s and shows an offline banner when the server is unreachable or the browser reports offline.
- **Props**: none
- **Used in**: app shell
- **Notes**: `/api/health` currently returns 200 unconditionally without checking real dependencies (see `SCAFFOLD_NOTES.md`) — this banner only detects total unreachability today, not degraded backend state.

### AnnouncementsBanner
- **File**: `components/announcements-banner.tsx`
- **Purpose**: Dismissible top banner for product announcements, wrapping shadcn's `Banner` primitive.
- **Props**: `title: string`, `description: string`, `showActionButton?: boolean`, `actionButtonText?: string`, `icon: ReactNode`
- **Used in**: app shell (opt-in per page/feature)
- **Notes**: Local `open` state only — dismissal doesn't persist across reloads yet.

### PageHero
- **File**: `components/pageHero.tsx`
- **Purpose**: Larger hero-style page header, for pages that need more than the standard `h1`/`p` title pattern.
- **Used in**: feature pages that opt in
- **Notes**: Prefer the plain title/description pattern (see `ui-rules.md` → Layout) unless a page specifically needs this.

### Loader
- **File**: `components/loader.tsx`
- **Purpose**: Shared loading indicator.
- **Used in**: `main.tsx` while Clerk is loading; available anywhere a loading state is needed.

### Data grids — contacts / contracts / projects / transactions
- **Files**: `components/data-grids/contacts-datagrid.tsx`, `contracts-datagrid.tsx`, `projects-datagrid.tsx`, `transactions-datagrid.tsx`
- **Purpose**: Feature-specific TanStack Table grids built on the `reui/data-grid` wrapper.
- **Notes**: `components/data-grids/datagrid-template.tsx` is the copy-from-scratch starting point for a new resource's grid — mirror its structure rather than building a table from raw markup. Follows the pattern noted in `ui-rules.md`.

### AddEditContactForm
- **File**: `components/forms/contacts/add-edit-contact-form.tsx` (797 lines)
- **Purpose**: The real create *and* edit form for a contact — one component, `mode="add" | "edit"` prop switches behavior. Multi-step (`Stepper`): contact info → address → emergency/next-of-kin.
- **Props**: `mode: "add" | "edit"`, `contactId?: string` (required for edit), `initialData?: Partial<ContactRecord>` (pre-seeds the edit form so it renders instantly instead of a loading skeleton — see `rowToContactSeed()` in `contacts-datagrid.tsx`), `onSuccess?: () => void`
- **Used in**: `routes/_authed/_org/contacts/index.tsx` (the page's "New Contact" quick-action sheet, `mode="add"`), `reusable-quick-actions.tsx` (global "Add Contact" quick action), `contacts-datagrid.tsx` (row-level Edit action, `mode="edit"`)
- **Notes**: This is now the reference pattern for any new multi-step, validated form in this codebase — see `ui-rules.md` → Forms for the pattern it establishes (per-step `zod` schemas, `Stepper`, `UNSET` sentinel for optional Radix `Select`s, self-closing via `useSheetControl()`). `add-contact-form.tsx` and `edit-contact-form.tsx` still exist as empty stub files — they were superseded by this combined component and can be deleted once confirmed unused elsewhere. `view-contact-form.tsx` and `client-statement.tsx` are still empty stubs — the datagrid's "View" action currently renders an inline detail sheet directly in `contacts-datagrid.tsx`, not through `view-contact-form.tsx`.

### PhoneInput
- **File**: `components/reui/phone-input.tsx`
- **Purpose**: Country-code-aware phone number input — flag + country combobox (built on the new `Combobox` primitive) + formatted number field, wrapping `react-phone-number-input`.
- **Props**: `variant?: "sm" | "default" | "lg"`, plus standard controlled-input props (`value`, `onChange`) via `react-phone-number-input`'s API.
- **Used in**: `AddEditContactForm` (mobile number, alt mobile number, next-of-kin mobile fields)
- **Notes**: Pulled from the `@reui` registry — file carries a stray `"use client"` directive at the top, which is a harmless no-op in this Vite SPA (see `code-standards.md` note on registry-sourced files). Use this instead of a plain `Input` for any new phone-number field so formatting/validation stays consistent.

### Stepper (+ StepperNav / StepperItem / StepperTrigger / StepperPanel / etc.)
- **File**: `components/reui/stepper.tsx`
- **Purpose**: Multi-step form/wizard primitive — horizontal or vertical, controlled or uncontrolled active-step state, per-step `active`/`completed`/`inactive`/`loading` visual states.
- **Used in**: `AddEditContactForm`
- **Notes**: This is the intended primitive for any future multi-step flow (e.g. the contract-creation flow noted as unverified in `progress-tracker.md`) — check here before hand-rolling step state.

### Combobox
- **File**: `components/ui/combobox.tsx`
- **Purpose**: Searchable select/autocomplete, built on `cmdk` + Radix `Popover` (shadcn primitive).
- **Used in**: `PhoneInput` (country selector); available generally for any searchable-select need.
- **Notes**: Prefer this over a plain `Select` once an option list gets long enough that scrolling to find an item is annoying (country lists, long enum lists, etc.).

### RadioGroup
- **File**: `components/ui/radio-group.tsx`
- **Purpose**: Standard shadcn radio-group primitive (Radix-based).
- **Used in**: not yet referenced by any feature component as of this update — added as a base primitive, available for use.

### Toggle
- **File**: `components/ui/toggle.tsx`
- **Purpose**: Standard shadcn toggle/pressed-button primitive (Radix-based).
- **Used in**: not yet referenced by any feature component as of this update — added as a base primitive, available for use.

### Billing SDK component suite (`components/billingsdk/`) — scaffolded, not yet integrated
- **Files**: `cancel-subscription-card.tsx`, `cancel-subscription-dialog.tsx`, `invoice-history.tsx`, `payment-card.tsx`, `payment-method-selector.tsx`, `subscription-management.tsx`, `update-plan-card.tsx`, `update-plan-dialog.tsx` — plus matching `*-demo.tsx` files at `components/` root and `lib/billingsdk-config.ts`.
- **Purpose**: A full subscription-management UI kit (current-plan summary, cancel flow, plan upgrade/downgrade dialog, payment-method selector, invoice history) pulled from the new `@billingsdk` registry (`components.json`).
- **Used in**: **Nothing yet.** No route or nav entry references any of these components or the demo files — confirmed by searching `src/client/routes/` and the sidebar nav config. `lib/billingsdk-config.ts` still contains the registry's own placeholder example data (mentions "Liveblocks" pricing tiers, unrelated to ArdhiFlow) — it has not been customized with real ArdhiFlow plan/pricing data yet.
- **Notes**: Given Charles's past PayPal Subscriptions billing work on other projects (RareBooks), this strongly looks like the start of a **tenant-facing self-serve subscription management feature** — i.e. letting an org admin view/manage *their organization's ArdhiFlow subscription* (plan, payment method, invoices), not a customer-facing feature of the land-sale business itself. This is an inference, not confirmed in code or nav — verify intent before building it out further. See `build-plan.md` and `progress-tracker.md` for how this is now tracked. Before wiring these in: (1) replace the demo config in `billingsdk-config.ts` with real plan data, (2) confirm whether billing is PayPal Subscriptions-backed (consistent with Charles's other projects) or something else, (3) delete the `*-demo.tsx` files once real usage replaces them — they're registry scaffolding, not app code.

### Reusable primitives (`components-reusable/`)
- **reusable-empty.tsx** — standard empty-state block (icon + message + optional CTA)
- **reusable-stats.tsx** — metric/stat tile, used for dashboard-style summary numbers
- **reusable-quick-actions.tsx** — quick-action button group
- **reusable-table-action-bar.tsx** — bulk-action bar shown above a data grid when rows are selected
- **reusable-sheet.tsx** — side-sheet wrapper (create/edit panels)
- **reusable-tooltip.tsx** — standard tooltip wrapper over shadcn's `Tooltip`
- **Notes**: Use these before building a one-off equivalent — they exist specifically to avoid every feature area growing its own empty-state/stat-tile/tooltip variant.

### shadcn/ui primitives (`components/ui/`)
- 30+ generated primitives (`button`, `dialog`, `dropdown-menu`, `sidebar`, `banner`, `calendar`, `command`, `field`, `input-group`, `combobox`, `radio-group`, `toggle`, etc.) plus two date pickers (`date-range-picker.tsx`, `date-range-picker-alt.tsx`).
- **Never edit these directly** — add/update via `npx shadcn add <component>` so registry-tracked updates aren't lost. If you need a variant that doesn't exist, check the `@diceui`, `@reui`, and `@billingsdk` registries (configured in `components.json`) before building custom.
