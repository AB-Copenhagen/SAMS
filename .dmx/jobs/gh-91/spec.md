---
ticket: gh-91
branch: feature-gh-91-sync-and-display-goliath-app-engagement
summary: Sync and display Goliath app-engagement fields on customer detail page
ticketing: github-issues
---

# Sync and display Goliath app-engagement fields on customer detail page

**Ticket:** [#91](https://github.com/AB-Copenhagen/SAMS/issues/91)
**Type:** feature
**Branch:** feature-gh-91-sync-and-display-goliath-app-engagement

---

## Context
Goliath's standard data point `lastActiveAt` indicates how recently a fan used AB's mobile app, but today's Goliath sync (`app/api/cron/sync-goliath-segments/route.ts`) only pulls segment membership, not this per-user field, so it isn't persisted or shown on `/customers/[id]`'s Goliath card.

`isAppUser` and `hasPushPermission` were originally in scope too, but investigation found neither appears anywhere in Goliath's API (checked the live OpenAPI spec at `GET /docs-json` and the `/public/users/{id}` response body) — only in the dashboard. They're split out to #93 pending a direct answer from Goliath/SportsInnovation on whether they're exposable at all, and are out of scope here.

## Scope
- Add a `goliathLastActiveAt` fetch to `lib/goliath.ts` using `GET /public/users/{id}` (confirmed working live against AB's account 2026-10-27, though absent from Goliath's published OpenAPI spec — accepted as a known risk per developer decision, see Questions)
- Add a `goliathLastActiveAt` column to `prisma/schema.prisma`'s `Customer` model, applied via `scripts/push-turso.mjs`
- Fetch it lazily per customer (keyed on `customer.goliathUserId`), following the existing Shopify/MailerLite/Vivenu pattern in `lib/customer-enrichment.ts` — not the segment-walking cron, since this is a single-user lookup, not something the cron's bulk segment walk produces
- Display it in the Goliath card on `app/customers/[id]/page.tsx`, below the existing segment chips

## Out of Scope
- `isAppUser`, `hasPushPermission` — split to #93
- Mobile app platform (Android/iOS) or app version — Goliath's public docs document no data point for either; not attempted here
- Writing this field back to Goliath (`pushDataPoint` is write-only and unrelated to this read path)
- Fixing why `GOLIATH_API_KEY` currently sees 0 segments (tracked separately, being debugged by the developer) — this ticket's new fetch only runs for customers that already have a `goliathUserId`, which still depends on the segment-walk cron working
- Any change to the existing segment sync/display logic beyond adding this one field alongside it

## Technical Approach
- `lib/goliath.ts` is the vendor client (per `systemPatterns.md`) — add the new read here, not inline in the enrichment module or page
- This is a **lazy, per-customer enrichment**, not a cron addition: `lib/customer-enrichment.ts`'s `refreshCustomerExternalData` is the existing pattern for exactly this shape of fetch (single customer, on page view, TTL-gated via `isExternalDataStale`, independently try/caught so one platform's failure can't block another's refresh) — follow it, gated on `customer.goliathUserId` being set (same way the Vivenu block gates on `vivenuCustomerId`) and reusing the existing `goliathSyncedAt` TTL field rather than adding a second one
- No `prisma migrate` in this repo — new columns ship via `scripts/push-turso.mjs` or a one-shot `/api/system/*` route, per `techContext.md`'s Constraints
- `app/customers/[id]/page.tsx`'s existing Goliath card (`goliathSummary`/`goliathUrl`/`syncedLabel(customer.goliathSyncedAt)`) is the natural place to add this field
- Known limitation: `customer.goliathUserId` is only ever populated by the segment-walking cron, which currently returns 0 segments for AB's API key (tracked outside this ticket) — until that's fixed, this new fetch will simply have nothing to key off of for any customer. Not a reason to block this ticket; the code should work correctly once `goliathUserId` starts populating again.

---

## Questions
<!-- Answer each question before running /dmx/plan. -->

1. How do we read `isAppUser`/`lastActiveDate`/`hasPushPermission` per customer from Goliath? Its public docs name these as standard data points but document no bulk/per-user read endpoint — only the Segments API. Do we need Goliath/SportsInnovation to expose a data-points read endpoint, or do we instead create three new segments (e.g. "App users", "Has push permission") in the Goliath dashboard and walk them via the existing `listSegments`/`getSegmentMembers` sync, deriving these as booleans (and separately sourcing `lastActiveDate`)?
   Answer: Let's get some test records and make a decision
   Resolved (2026-10-27): pulled a real record via `GET /public/users/{id}` (undocumented, not in Goliath's `GET /docs-json` spec, but confirmed live against AB's account). It returns `lastActiveAt` directly — no segment walk needed for that field. `isAppUser`/`hasPushPermission` are absent from that response and from the entire published OpenAPI spec. Decision: ship `lastActiveAt` now via this endpoint despite it being undocumented; split `isAppUser`/`hasPushPermission` to #93 pending Goliath/SportsInnovation confirming whether they're reachable via API at all.

2. The docs describe `hasPushPermission`'s scope (`pushPermission`) as "internal" and say integrations shouldn't target it directly — does that mean this field is actually unavailable to us via the public API, requiring a direct ask to Goliath/SportsInnovation?
   Answer: we just want this for information purposes and will not rely on it
   Resolved (2026-10-27): moot for this ticket — `hasPushPermission` is now out of scope, tracked in #93.

3. Should these fields be nulled out if a customer disappears from whatever Goliath source we end up reading (matching current segment behavior, which just stops touching a customer who drops out, leaving stale values in place), or should missing-from-Goliath explicitly reset them to unknown?
   Answer: Missing from Goliath should null this data out, e.g. it should match Goliath

4. Where in the Goliath card should these render — a new stat row below the existing segment summary, or folded into it — and should the raw `lastActiveDate` show as a relative ("3 days ago") or absolute date, matching `syncedLabel`'s existing convention?
   Answer: below the segment summary
