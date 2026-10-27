# 0003. Connect the broadcast dashboard to a real route

**Date**: 2026-09-08 **Status**: In Progress

## Summary

Makes `/messaging/broadcasts` a working page instead of a dead end: it currently renders `BroadcastDashboard` without the callback that component needs to ever reach the compose flow, and its "your campaigns" list is hardcoded to an empty state regardless of what's actually in the database. This connects it to real `sms_campaigns` data, restores dashboard → compose navigation, and removes the Reminder page's now-duplicate copy of the same UI, so there is exactly one honest entry point.

## Requirements

**User stories**:
- As staff, I want the Broadcasts page in the nav to actually work, so a page I can click on isn't a dead end.
- As staff, I want to see the campaigns that already exist, so the page reflects reality instead of always claiming there are none.
- As staff, I want one place to start a broadcast, not two inconsistent ones.

**Acceptance criteria**:
- **AC-1**: `/messaging/broadcasts` renders without a type or runtime error and shows a working dashboard.
- **AC-2**: The dashboard lists real `sms_campaigns` rows (name, type, status, recipient count, created date) when any exist; the existing "you haven't created any campaigns yet" empty state shows only when the list is genuinely empty.
- **AC-3**: "Create Campaign" (both the header button and the empty-state button) reaches the existing `BroadcastFlow` compose UI in place, with no page navigation; its back action returns to the dashboard — the same in-component toggle already proven in `MessagingPortal`.
- **AC-4**: The Reminder page no longer has its own "Message Broadcast" button or sheet; `MessagingPortal` is retired (its logic now lives directly in the Broadcasts route) rather than left behind as unused code.
- **AC-5**: The new campaigns endpoint is read-only (GET) and does not let anything create, update, or send a campaign — that stays out of scope, deferred to the NextSMS send-flow spec.

## Decision

**Chosen option**: Option 2. Options and reasoning: [rationale.md](rationale.md).

## Feature design

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/api/campaigns` | GET | — | array of `{id, name, type, status, recipientCount, createdAt}`, newest first | any authenticated staff | — |

No create, update, delete, or send endpoint exists for campaigns after this spec — that is explicitly the NextSMS send-flow spec's job (AC-5).

**Value sourcing**:

| Action | Value produced | Source |
|---|---|---|
| Dashboard list | campaign rows | `db.query.smsCampaigns.findMany({orderBy: [desc(smsCampaigns.createdAt)]})` — same plain full-table-read shape already used by every other list endpoint in this codebase (`contacts.ts`, `installments.ts`, `message-templates.ts`); nothing here paginates or filters server-side today |
| Dashboard list | empty vs. populated state | the fetched array's length — empty shows the existing hardcoded copy unchanged, non-empty shows the new list |

**UI changes**:
- `BroadcastDashboard`: self-fetches via `GET /api/campaigns` (matching how every other "list something real" component in this codebase already works — none of the datagrids receive their data as a prop) and renders a plain list (name, type, status, recipient count, created date) above the create actions when the list is non-empty; the existing empty-state copy and both "Create Campaign" buttons are unchanged, just now wired to a real `onCreateNew`.
- `messaging/broadcasts.tsx`: gains the `showFlow` local-state toggle (moved from `messaging-portal.tsx`); renders `BroadcastDashboard` or `BroadcastFlow` depending on it.
- `messaging-portal.tsx`: deleted — no remaining callers after `finance/reminder.tsx` is updated.
- `finance/reminder.tsx`: the "Message Broadcast" `ReusableSheet` + `Button` block removed, along with its now-unused `RadioIcon` and `MessagingPortal` imports. The Receivables Calendar action is untouched.

**Security model**: unchanged from the rest of the app — DB-per-tenant isolation. No admin gate on the new endpoint: viewing what campaigns exist is available to any authenticated staff member, the same level as viewing message templates.

**Configuration required**: none.

**Critical test scenarios**:
- Happy path: with at least one existing `sms_campaigns` row, `/messaging/broadcasts` shows it in a list, not the empty state. Verifies **AC-1**, **AC-2**.
- Empty case: with zero campaigns, the existing "you haven't created any campaigns yet" copy still shows exactly as before. Verifies **AC-2**.
- Navigation: clicking "Create Campaign" (either button) shows `BroadcastFlow` in place; its back action returns to the dashboard list, still on `/messaging/broadcasts`. Verifies **AC-3**.
- Reminder page: no "Message Broadcast" button appears there anymore; only the Receivables Calendar action remains. Verifies **AC-4**.

## Build plan

1. Add `GET /api/campaigns` in a new `src/worker/routes/campaigns.ts`, mounted in `src/worker/index.ts`. Read-only, per Feature design. Satisfies **AC-2**, **AC-5**.
2. Update `BroadcastDashboard` to self-fetch via the new endpoint and render a real list, falling back to the existing empty state when there's nothing to show. Satisfies **AC-1**, **AC-2**.
3. Fold the dashboard/flow toggle directly into `messaging/broadcasts.tsx`; delete `messaging-portal.tsx`. Satisfies **AC-1**, **AC-3**, **AC-4**.
4. Remove the "Message Broadcast" sheet and button from `finance/reminder.tsx`. Satisfies **AC-4**.

One slice — nothing here needs to land ahead of the rest of it.

## Consequences

**Positive**: Broadcasts becomes one honest, real entry point instead of two inconsistent ones; the dashboard stops claiming there are no campaigns when there are.

**Negative / tradeoffs**: visiting the now-working compose flow and clicking "Send Campaign" still does nothing — that's a deliberate scope boundary carried over from Context, not an oversight introduced here, but it may read as unfinished until the NextSMS send-flow spec lands.

**Neutral**: the new endpoint is add-only and has essentially no design risk on its own; the harder decisions (create, send, delivery tracking) stay entirely with the NextSMS spec.

## Follow-up

- [ ] The NextSMS send-flow spec (scope feature 10's remaining decision) is what makes "Create Campaign" actually persist and send something; this spec only makes the *already-built* dashboard UI reachable and honest about what's already in the database.
- [ ] Once real sending exists, decide whether the campaigns list needs pagination or filtering — fetching everything is fine at today's scale and matches every other list endpoint in this codebase, but won't stay true forever.
