# ArdhiFlow — UI Tokens

> **Rule**: Never use raw hex codes or arbitrary Tailwind values (`text-[#3B82F6]`).
> Always reference the CSS variables defined in `src/client/index.css`, or their mapped
> Tailwind class (`bg-primary`, `text-muted-foreground`, etc.).

This project uses Tailwind CSS v4's CSS-first config — there is **no `tailwind.config.ts`**.
All tokens are declared as CSS custom properties in `src/client/index.css` and mapped to
Tailwind utilities via the `@theme inline` block. Colors are defined in `oklch()`, not hex.

## Color Palette

```css
/* :root (light mode) — src/client/index.css */
--background:           oklch(1 0 0);
--foreground:            oklch(0.141 0.005 285.823);
--card:                   oklch(1 0 0);
--card-foreground:        oklch(0.141 0.005 285.823);
--popover:                 oklch(1 0 0);
--popover-foreground:       oklch(0.141 0.005 285.823);

--primary:                   oklch(0.5 0.134 242.749);      /* brand blue */
--primary-foreground:         oklch(0.977 0.013 236.62);
--secondary:                    oklch(0.967 0.001 286.375);
--secondary-foreground:          oklch(0.21 0.006 285.885);
--muted:                          oklch(0.967 0.001 286.375);
--muted-foreground:                oklch(0.552 0.016 285.938);
--accent:                            oklch(0.967 0.001 286.375);
--accent-foreground:                  oklch(0.21 0.006 285.885);
--destructive:                          oklch(0.577 0.245 27.325);
--border:                                oklch(0.92 0.004 286.32);
--input:                                  oklch(0.92 0.004 286.32);
--ring:                                    oklch(0.705 0.015 286.067);

/* Status colors — mapped from Tailwind's own palette, not custom hex */
--success:        var(--color-emerald-500);
--success-foreground: var(--color-emerald-900);
--info:            var(--color-violet-500);
--info-foreground:  var(--color-violet-900);
--warning:          var(--color-yellow-500);
--warning-foreground: var(--color-yellow-900);
--destructive-foreground: var(--color-red-800);
--invert:            var(--color-zinc-900);
--invert-foreground:  var(--color-zinc-50);

/* Chart palette (5-step blue ramp) */
--chart-1: oklch(0.828 0.111 230.318);
--chart-2: oklch(0.685 0.169 237.323);
--chart-3: oklch(0.588 0.158 241.966);
--chart-4: oklch(0.5 0.134 242.749);
--chart-5: oklch(0.443 0.11 240.79);

/* Sidebar-specific tokens (separate from the general palette) */
--sidebar:                  oklch(0.985 0 0);
--sidebar-foreground:        oklch(0.141 0.005 285.823);
--sidebar-primary:            oklch(0.588 0.158 241.966);
--sidebar-primary-foreground:  oklch(0.977 0.013 236.62);
--sidebar-accent:                oklch(0.967 0.001 286.375);
--sidebar-accent-foreground:      oklch(0.21 0.006 285.885);
--sidebar-border:                  oklch(0.92 0.004 286.32);
--sidebar-ring:                     oklch(0.705 0.015 286.067);
```

## Dark Mode

Dark mode is supported via a `.dark` class scope (`@custom-variant dark (&:is(.dark *))`, toggled by `mode-toggle.tsx` using `next-themes`). Every token above has a `.dark` override in `index.css` with adjusted lightness — status colors (`success`/`info`/`warning`/`destructive`) keep the same hue but swap to a slightly different foreground shade for contrast. Always check `.dark` renders correctly for any new token-based component; don't assume light-mode values are dark-mode-safe.

## Typography

```css
--font-sans: "Ubuntu", sans-serif;   /* @fontsource/ubuntu — weights 300/400/500/700 loaded */
--font-heading: var(--font-sans);     /* headings use the same family, no separate display font */
```

Tailwind's default type scale (`text-xs` through `text-4xl`) is used as-is — no custom scale is defined. Use standard Tailwind size classes.

## Border Radius

```css
--radius:      0.625rem;                 /* base */
--radius-sm:   calc(var(--radius) * 0.6);
--radius-md:   calc(var(--radius) * 0.8);
--radius-lg:   var(--radius);
--radius-xl:   calc(var(--radius) * 1.4);
--radius-2xl:  calc(var(--radius) * 1.8);
--radius-3xl:  calc(var(--radius) * 2.2);
--radius-4xl:  calc(var(--radius) * 2.6);
```

## Component Library Wiring

- **shadcn/ui** — style `radix-mira`, base color `zinc`, CSS variables enabled, no prefix. Config in `components.json`. Also wired to two extra registries: `@diceui` (diceui.com) and `@reui` (reui.io) — check `ui-registry.md` before assuming a component needs to be built from scratch; it may already be pullable from one of these registries via the shadcn CLI.
- **Icons**: `lucide-react` exclusively (`iconLibrary: "lucide"` in `components.json`).
- **Clerk theming**: Clerk's own UI (`@clerk/ui`) is themed with the `shadcn` preset (`@clerk/ui/themes/shadcn.css` imported in `index.css`, `shadcn` theme object passed to `<ClerkProvider appearance>`), so Clerk's sign-in/sign-up/org-switcher UI visually matches the rest of the app automatically — don't hand-restyle Clerk components.

## Tailwind v4 Wiring (no config file)

```css
/* index.css — how tokens become Tailwind classes */
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-primary: var(--primary);
  --color-background: var(--background);
  /* ...every token above is re-mapped here with a --color-/--radius- prefix
     so Tailwind generates bg-primary, text-foreground, rounded-lg, etc. */
}
```

New tokens must be added in **both** places: the raw value under `:root`/`.dark`, and the `--color-*`/`--radius-*` alias inside `@theme inline` — only the aliased name becomes a usable Tailwind class.
