# ArdhiFlow marketing site

Static Astro site, deployed as its own Cloudflare Worker, independent from
the app in the repo root. No adapter — this is a plain static build (no
server logic yet), so `astro build` output deploys directly as Workers
static assets.

## Local dev

```bash
npm install
cp .env.example .env   # PUBLIC_APP_URL defaults to http://localhost:5173,
                        # which matches the app's `npm run dev` port
npm run dev             # localhost:4321
```

## Deploy

```bash
npm run deploy   # astro build && wrangler deploy
```

First deploy will prompt you to create the Worker (`ardhi-flow-marketing`,
from `wrangler.jsonc`) if it doesn't exist yet.

## Wiring up the subdomain split

This site is meant to live on your **root domain**, with the actual product
moved to an **`app.` subdomain** — see the rest of this doc for what that
means in practice. Three things need to happen for that to work:

1. **DNS** — in the Cloudflare dashboard, add this Worker as a custom domain
   on your root domain (`yourdomain.com`), and the existing app Worker as a
   custom domain on `app.yourdomain.com`.
2. **Set `PUBLIC_APP_URL`** — as a build-time env var for this project's
   production deploy (`https://app.yourdomain.com`), so every "Sign in" /
   "Get started" link on the page points at the right place.
3. **Clerk subdomain allowlist** — Clerk dashboard → your instance →
   Domains. Since both sites share the same root domain, Clerk already
   shares session state across them by default — you don't need the
   "satellite domain" feature, which is only for genuinely separate root
   domains. Just make sure `app.yourdomain.com` is in the allowed subdomain
   list for your production instance.

## What's here vs. what's not

This is a single static landing page — hero, three feature blocks, a
closing CTA. Deliberately left out rather than filled with placeholder
content that could get published as-is:

- **No pricing section** — add one once pricing is actually decided.
- **No testimonials / customer logos** — there's no real social proof yet;
  a fabricated one would be worse than none.
- **No blog / additional pages** — if you add one, it'll likely need
  server-rendering (or at least a content collection) — that's when adding
  `@astrojs/cloudflare` as an adapter is worth it, not before.

## Structure

```
src/
  pages/index.astro          the whole page
  components/
    PlanIllustration.astro   the hero diagram (plot boundaries + survey pins)
    Mark.astro               the small logo mark, matches the app sidebar
  styles/global.css          design tokens — same color values as the app
                              (src/client/index.css) for brand consistency,
                              plus the ink/stamp palette used only in the
                              hero and closing CTA
```
