# ArdhiFlow — UI Component Registry

> **Agent rule**: Before building any UI element, check here first.
> After building any UI element, add it here.

Last updated: 2026-08-16

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

### Contacts forms (in progress)
- **Files**: `components/forms/contacts/add-contact-form.tsx`, `edit-contact-form.tsx`, `view-contact-form.tsx`, `client-statement.tsx`
- **Purpose**: Create/edit/view a contact and generate a client statement.
- **Notes**: These files currently exist as empty stubs in the repo — not yet implemented. Treat them as the intended location for this work, not as a reference pattern to copy from yet. Use `NewPlotForm` (inline in `routes/_authed/_org/projects/plots.tsx`) as the actual reference pattern for a controlled-component form wired to a `useMutation`.

### Reusable primitives (`components-reusable/`)
- **reusable-empty.tsx** — standard empty-state block (icon + message + optional CTA)
- **reusable-stats.tsx** — metric/stat tile, used for dashboard-style summary numbers
- **reusable-quick-actions.tsx** — quick-action button group
- **reusable-table-action-bar.tsx** — bulk-action bar shown above a data grid when rows are selected
- **reusable-sheet.tsx** — side-sheet wrapper (create/edit panels)
- **reusable-tooltip.tsx** — standard tooltip wrapper over shadcn's `Tooltip`
- **Notes**: Use these before building a one-off equivalent — they exist specifically to avoid every feature area growing its own empty-state/stat-tile/tooltip variant.

### shadcn/ui primitives (`components/ui/`)
- 30+ generated primitives (`button`, `dialog`, `dropdown-menu`, `sidebar`, `banner`, `calendar`, `command`, `field`, `input-group`, etc.) plus two date pickers (`date-range-picker.tsx`, `date-range-picker-alt.tsx`).
- **Never edit these directly** — add/update via `npx shadcn add <component>` so registry-tracked updates aren't lost. If you need a variant that doesn't exist, check the `@diceui` and `@reui` registries (configured in `components.json`) before building custom.
