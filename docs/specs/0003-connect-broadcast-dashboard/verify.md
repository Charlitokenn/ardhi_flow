# Verify: connect-broadcast-dashboard · spec 0003 · updated 2026-10-27
_Steps derived from spec 0003 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Sign in as an org member of a tenant (the `e2e/global-setup.ts` ticket flow works) and run the dev server with `pnpm -F @ardhiflow/web dev`.

## UI / manual
- [x] Visit `/messaging/broadcasts` → the "Message Broadcasts" dashboard renders, no runtime error in the console → AC-1
- [x] With at least one `sms_campaigns` row in the tenant DB, the list shows each row's name, status badge, type label (e.g. "Payment reminder"), created date, and Recipients count matching `recipient_count`; no empty state → AC-2
- [x] With zero campaigns (or `GET /api/campaigns` returning `[]`), "You haven't created any campaigns yet" shows with a "Create Your First Campaign" button → AC-2
- [x] Click the header "Create Campaign" → "New Campaign" compose screen appears, URL stays `/messaging/broadcasts`; click ✕ → back to the dashboard list → AC-3
- [x] From the empty state, click "Create Your First Campaign" → compose screen appears in place; ✕ returns to the dashboard → AC-3
- [x] Visit `/finance/reminder` → no "Message Broadcast" button or sheet; only the "Receivables Calendar" action remains → AC-4
- [x] Open Quick Actions → "Message Broadcasting" goes to `/messaging/broadcasts`, not a sheet (found during build, same intent as AC-4) → AC-4

## Commands
- [x] `GET /api/campaigns` with a session token → 200, an array of `{id, name, type, status, recipientCount, createdAt, …}` newest first; values match `select name, type, status, recipient_count, created_at from sms_campaigns order by created_at desc` on the tenant DB → AC-2
- [x] `GET /api/campaigns` with no token → 401 → AC-5 (auth chain intact)
- [x] `POST /api/campaigns`, `PUT`/`PATCH`/`DELETE /api/campaigns/:id`, `POST /api/campaigns/:id/send` → 404 (no write routes exist) → AC-5
- [x] Confirm `apps/web/src/client/components/messaging-portal.tsx` does not exist and nothing imports `MessagingPortal` → AC-4
- [ ] `pnpm -F @ardhiflow/web build` and `pnpm -F @ardhiflow/web lint` pass → AC-1

## Value sourcing
- [ ] Campaign rows come from the tenant DB, per tenant: sign in to a second org with different (or no) campaigns → its list differs and never shows the first tenant's rows → AC-2
- [x] Empty vs populated is driven by the fetched array's length: a status filter tab that matches nothing shows "No campaigns match this filter.", not the first campaign empty state → AC-2

## Acceptance-criteria coverage
- AC-1 covered by the dashboard render step and the build/lint command · AC-2 by the populated list, empty state, GET shape, and value sourcing steps · AC-3 by both Create Campaign navigation steps · AC-4 by the Reminder page, Quick Actions, and MessagingPortal removal steps · AC-5 by the no token and write route steps
