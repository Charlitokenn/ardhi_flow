# PostHog Self-driving setup — ArdhiFlow

**Date:** 2026-08-11  
**Project:** ArdhiFlow (project ID 242624)

## Summary

PostHog Self-driving is now configured for ArdhiFlow. Error tracking, session replay, support (conversations), health checks, and the plot-creation conversion funnel are all wired to the inbox. GitHub Issues for `Charlitokenn/ardhi_flow` is syncing, and a custom scout watches the core plot-creation flow for conversion drops. Findings will start appearing in the [Self-driving inbox](https://eu.posthog.com/project/242624/inbox) within ~30 minutes.

---

## AI data processing

**Approved.** Organization-level AI data processing consent was granted before this run.

---

## GitHub

**Connected during this run.** GitHub App integration ID `77523`, account `Charlitokenn`. Grants Self-driving code access for research and fix generation.

---

## Products enabled

The `products-enable` MCP tool was not available on this deploy. The client init (`src/client/routes/__root.tsx`) was checked and is clean — no overrides that would block the server flips.

| Product | Status | Notes |
|---|---|---|
| Session Replay | **Follow-up required** | Server-side toggle not verified via API. Enable in PostHog → Settings → Session replay → "Record user sessions". Client init has no `disable_session_recording` override. |
| Error Tracking | **Client-enabled** | `capture_exceptions: true` is set in the PostHog init. Verify server-side toggle in Settings → Error tracking → "Enable exception autocapture". |
| Support (Conversations) | **Follow-up required** | Server-side toggle not verified via API. Enable from the product sidebar. Tickets only arrive once an inbound channel (email / inbox / Slack) is connected — see Follow-ups. |

---

## Signal sources

| source_product | source_type | Action |
|---|---|---|
| `signals_scout` | `cross_source_issue` | **ON by default** — no config row needed; scout findings reach inbox automatically |
| `health_checks` | `health_issue` | **Enabled** (id: `019ff126-d017-7c83-9aa2-1bd61fa2482c`) |
| `error_tracking` | `issue_created` | **Enabled** (id: `019ff126-d2e3-7d3f-a968-56a8ffa9b677`) |
| `error_tracking` | `issue_reopened` | **Enabled** (id: `019ff126-d5c9-7e0b-b696-4c97fe421010`) |
| `error_tracking` | `issue_spiking` | **Enabled** (id: `019ff126-db27-75a2-9b64-3f0e8d5dfe5f`) |
| `session_replay` | `session_analysis_cluster` | **Enabled** (id: `019ff126-dd7a-7949-82b5-679e8ddf1367`, sample rate: 10%) |
| `conversations` | `ticket` | **Enabled** (id: `019ff126-e008-7ee1-bd32-3a517ee88232`) |
| `llm_analytics` | — | **Skipped** — no LLM/AI usage detected |
| `logs` | — | **Skipped** — logs product not in use |
| `replay_vision` | — | **Not a config row** — Replay Vision is self-authorizing via `emits_signals` on each scanner |

---

## Connected tools

| Tool | Status |
|---|---|
| GitHub Issues (`Charlitokenn/ardhi_flow`) | **Connected by this setup** — warehouse source `019ff12a-b0f7-0000-6e1c-392b578faa69` created, issues table syncing incrementally. Responder enabled (id: `019ff12a-d336-73fe-afa2-8216356c906e`). Only the `issues` table is syncing; additional tables can be enabled in PostHog → Data pipeline. |

---

## Scout troop

**Run budget:** 100 runs/day (early access default, confirmed via `scout-metadata-get`). 3 runs/tick max. 0 runs used today. Banner: _"Scouts are in early access. Each project gets up to 100 scout runs a day. Contact team-self-driving@posthog.com if you need more."_

### Enabled (6 scouts)

| Scout | Reason enabled |
|---|---|
| `signals-scout-general` | Always on — cross-product correlations and surfaces no specialist covers |
| `signals-scout-product-analytics` | Active custom events (`onboarding_viewed`, `add_plot_clicked`, `plot_created`, `plot_creation_failed`, `upgrade_to_pro_clicked`) in use |
| `signals-scout-health-checks` | New project, instrumentation health issues are immediately actionable |
| `signals-scout-observability-gaps` | Custom events with no insight/dashboard coverage yet |
| `signals-scout-data-warehouse` | GitHub Issues data source just connected — watches import health |
| `signals-scout-plot-creation-funnel` | **Custom** — see Custom scouts section below |

### Disabled (22 scouts)

| Scout | Reason |
|---|---|
| `signals-scout-error-tracking` | Covered by native error tracking source (step 4) — intentional, not a gap |
| `signals-scout-session-replay` | Covered by native session replay source (step 4) — intentional, not a gap |
| `signals-scout-ai-observability` | No LLM/AI usage detected |
| `signals-scout-surveys` | No surveys in use |
| `signals-scout-revenue-analytics` | No payment SDK (Stripe, etc.) — plots have prices but no payment processing instrumented |
| `signals-scout-feature-flags` | No feature flags in active use |
| `signals-scout-experiments` | No A/B experiments running |
| `signals-scout-web-analytics` | No UTM/referrer tracking; not a marketing-traffic-driven product |
| `signals-scout-csp-violations` | No CSP configured |
| `signals-scout-logs` | PostHog logs product not in use |
| `signals-scout-customer-analytics` | Group analytics not implemented (Clerk orgs used, but no PostHog group calls) |
| `signals-scout-apm` | No OpenTelemetry tracing |
| `signals-scout-data-pipelines` | No CDP destinations or batch exports |
| `signals-scout-conversations` | Support product not yet connected to a channel |
| `signals-scout-anomaly-detection` | No saved dashboards/insights to watch yet (new project) |
| `signals-scout-replay-vision` | No prior Replay Vision observations to trend across |
| `signals-scout-inbox-validation` | No shipped fixes to validate yet (first-run project) |
| `signals-scout-insight-alerts` | No configured insight alerts |
| `signals-scout-mcp-tool-calls` | No MCP tool call telemetry |
| `signals-scout-tasks` | No PostHog Tasks in use |
| `signals-scout-skills-store` | Skill hygiene scout — not needed for a new troop |
| `signals-scout-web-vitals` | No `$web_vitals` events captured |

**Re-enable when ready:** `feature-flags` (when feature flags are implemented), `revenue-analytics` (when a payment SDK is added), `customer-analytics` (when group analytics is added for Clerk orgs), `experiments` (when A/B tests run), `web-analytics` (when UTM tracking is added).

**Noise escape hatch:** If any scout turns out noisy, set `emit: false` on its config in PostHog → Self-driving to switch it to dry-run — it keeps running and logging but writes nothing to the inbox until you flip it back.

---

## Custom scouts

### `signals-scout-plot-creation-funnel` — approved and created

- **What it watches:** The `add_plot_clicked → plot_created` conversion rate and `plot_creation_failed` rate, daily.
- **Discriminator:** `plot_created / add_plot_clicked` ratio drops ≥15% vs the 7-day median while `add_plot_clicked` holds flat, OR `plot_creation_failed` ≥ 10% of `add_plot_clicked` (with at least 5 failures).
- **Why no built-in covers it:** `signals-scout-product-analytics` watches saved funnels — none exist yet. `signals-scout-observability-gaps` watches coverage, not conversion. `signals-scout-general` sweeps cross-product, not this specific pair.
- **Skill ID:** `019ff131-5ed2-7fb8-94d6-dcf4af808623`
- **Config ID:** `019ff131-8c0b-79e4-ac39-fd7e0ca2e1a9`

### Surfaces considered and ruled out

| Surface | Filter that killed it |
|---|---|
| Onboarding completion (`onboarding_viewed`) | No completion event to form a meaningful discriminator — only a view event is captured |
| Upgrade intent (`upgrade_to_pro_clicked`) | Click-only, no payment/upgrade completion event — discriminator is too weak |

---

## Replay Vision scanners

Replay Vision scanners are LLMs that watch individual session recordings on a schedule and push findings directly to the Self-driving inbox. Findings arrive at **half weight** — a single finding needs corroboration from another scanner (watching a different slice) before it is promoted into a report. The two scanners below are deliberately scoped to non-overlapping queries to keep corroboration independent. Credit estimation was not run (the `creating-replay-vision-scanners` skill was not available on this deploy) — the skeletons are conservatively scoped.

No recordings exist yet. Both scanners are armed and start working the day sessions begin arriving.

| Scanner | Status | Query scope | Sampling rate | Credits/observation |
|---|---|---|---|---|
| Broken experiences | **Created** (`019ff132-bc57-79ae-9a25-c05679ed63c1`) | Sessions visiting `/dashboard/plots` — the plot creation form, ArdhiFlow's core completion flow | 50% | 15 |
| User frustration | **Created** (`019ff132-c98d-7902-ae18-f81ba687093c`) | Sessions with a `$rageclick` event (any page) | 100% (narrow gate) | 15 |

**Why `/dashboard/plots` for "Broken experiences":** The plot creation form at `/dashboard/plots` is where users enter reference, location, and price data and submit — the core value-delivery action in ArdhiFlow. Breakage here (failed submit, silent error, broken layout) directly prevents a user from doing the product's primary job.

---

## Follow-ups

- [ ] **Enable Session Replay server-side:** PostHog → Settings → Session replay → turn on "Record user sessions".
- [ ] **Verify Error Tracking server-side:** PostHog → Settings → Error tracking → confirm "Enable exception autocapture" is on. (The client init already has `capture_exceptions: true`.)
- [ ] **Enable Support / Conversations server-side:** PostHog → product sidebar → Conversations. Then connect an inbound channel (email / inbox / Slack) so tickets start reaching the inbox.
- [ ] **Connect a Conversations inbound channel:** Support ticket signals are enabled but the Conversations responder stays idle until an email, inbox, or Slack channel is connected in PostHog.
- [ ] **Add group analytics for Clerk orgs:** If you want per-workspace analytics, call `posthog.group('organization', orgId, {...})` after the Clerk org is resolved — enables the `signals-scout-customer-analytics` scout later.
- [ ] **Save funnels in PostHog:** Create a `onboarding_viewed → plot_created` funnel insight in PostHog to feed `signals-scout-product-analytics` (it watches saved funnels, not raw events).
- [ ] **GitHub Issues syncing only the `issues` table:** More tables (pull requests, commits) can be enabled in PostHog → Data pipeline → GitHub source.

---

## What happens next

The scout coordinator picks up fresh configs within ~30 minutes. Each enabled scout runs once daily, drawing from the project's 100 run/day early-access budget. The Replay Vision scanners sweep matching recordings every 5 minutes once sessions exist. Findings cluster into reports in the [Self-driving inbox](https://eu.posthog.com/project/242624/inbox) — immediately-actionable reports can spin up coding tasks automatically.
