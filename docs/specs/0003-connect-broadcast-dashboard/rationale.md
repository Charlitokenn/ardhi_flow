# 0003. Connect the broadcast dashboard: rationale

_Decision history for [the build spec](index.md)._

## Context

`/messaging/broadcasts` was added directly rendering `<BroadcastDashboard/>`, but that component requires an `onCreateNew: () => void` prop; as committed this is a type error, and even fixed naively there would be no way to reach `BroadcastFlow` (which itself requires `onBack: () => void`). `/finance/reminder` already has a working version of this same idea, via a small wrapper (`MessagingPortal`) that holds local state to toggle between the two.

`BroadcastDashboard`'s campaign list is entirely hardcoded to "you haven't created any campaigns yet" — nothing queries `sms_campaigns`, and no `campaigns` API route exists at all, even though the table (`smsCampaigns`: id, name, type, status, recipientCount, createdAt) is fully modeled and has been since before this spec.

Nothing past the dashboard talks to a backend: `BroadcastFlow`'s audience, content, and send steps hold local state only, and "Send Campaign" doesn't call anything. That stays the separate, larger, already-flagged "SMS messaging (NextSMS)" decision (scope feature 10) — out of scope here. This spec only makes the dashboard itself real and reachable.

## Options considered

### Option 1: Fix the broken prop only, leave everything else

Pass a working `onCreateNew` to `<BroadcastDashboard/>` (e.g. render `<MessagingPortal/>` unchanged) and stop there.

**Pros**: smallest possible diff, zero new API surface.
**Cons**: leaves exactly the duplication the engineer asked to resolve — the Reminder page's sheet and the new nav page stay two independent, out-of-sync copies of the same UI — and the dashboard keeps claiming there are no campaigns regardless of what's in the database.

### Option 2: Fully connect it — real list data, one entry point, in-component navigation (chosen)

Add a minimal GET campaigns endpoint, wire the dashboard to it, fold `MessagingPortal`'s toggle logic directly into the Broadcasts route, and remove the Reminder page's redundant sheet.

**Pros**: matches every answer the engineer gave; Broadcasts becomes the one real, honest entry point into this feature.
**Cons**: touches four files instead of one, and needs a new (small, read-only) API route.

### Option 3: Real sub-routes for dashboard vs. compose

`/messaging/broadcasts` and `/messaging/broadcasts/new` as separate routes instead of in-component state, so the compose view has its own bookmarkable URL.

**Pros**: shareable URL, native browser back button.
**Cons**: the engineer explicitly chose in-component state over this, to keep the change smaller and reuse the already-proven `MessagingPortal` pattern rather than add new routing.

## Rationale

Each piece of Option 2 maps directly to one of the three answers the engineer gave, so there's little to weigh here beyond two implementation calls worth recording:

Retiring `MessagingPortal` rather than keeping it as a thin pass-through: once the Reminder page's sheet is removed (AC-4), it has exactly one remaining caller — the Broadcasts route itself — so keeping it as a separate file adds a layer of indirection with no reader benefit. Folding its dozen lines directly into the route keeps the toggle logic next to the one place that uses it.

The campaigns endpoint returns `sms_campaigns` rows with no joins: `recipientCount` is already a stored column on the table, so nothing needs to join out to `sms_messages` to show it in a list.
