---
ticket: gh-62
branch: feature-gh-62-record-guest-checkins-in-match-activity
summary: Record guest/unlinked check-ins in Match Activity report
ticketing: github-issues
---

# Record guest/unlinked check-ins in Match Activity report

**Ticket:** [#62](https://github.com/AB-Copenhagen/SAMS/issues/62)
**Type:** bug / feature
**Branch:** feature-gh-62-record-guest-checkins-in-match-activity

---

## Context

Investigated a report of lower-than-expected "Checked in" counts on `/customers/match-activity` after the 2026-10-24 match. Webhook delivery itself is healthy: 241 `scan.created` deliveries received by `app/api/webhooks/vivenu/route.ts`, all 200 OK, zero errors, payload shape confirmed live to match the assumed `data.scan` convention. 234 unique tickets scanned, all against a single Vivenu event (no duplicate-event split for this match — `mergeMatchesByDay` consolidation, added in #53, is working correctly).

The gap is downstream of delivery: the handler silently ignores (no DB write, no log) any approved check-in where the ticket has no `customerId`, or where no local `Customer` row matches that `vivenuCustomerId`. In today's scan log, ticket types that are plausible candidates for this (away-team tickets, "AB Internal" staff passes, comp/sponsor tickets) made up roughly 29% of all scans. These are real, approved check-ins that should be visible somewhere, but currently vanish entirely.

## Scope

- Add a `GuestCheckin` table (`eventId`, `ticketId`, `scannedAt`) recording an approved check-in scan that cannot be resolved to a local `Customer`. Created via a one-shot admin route, matching this repo's no-migrations convention (see `app/api/system/migrate-vivenu-fields` for the pattern).
- Update `app/api/webhooks/vivenu/route.ts`: when `getTicket` returns no `customerId`, or no local `Customer` matches `vivenuCustomerId`, write a `GuestCheckin` row instead of silently returning `ignored`. Dedupe on `ticketId` (a re-scanned ticket, e.g. re-entry, shouldn't create duplicate rows).
- Add a **"Guest check-ins"** stat, counted separately from "Checked in", to both:
  - `lib/customer-reports.ts` (`getMatchActivityUncached` / `MatchActivitySummary`)
  - `app/customers/match-activity/page.tsx`'s stat row.
  "Checked in" keeps meaning "known fan checked in"; no-show math (`ticketsSold - checkedIn`) is unaffected since guests were never counted as fans or no-shows.
- One-shot admin backfill route (same `app/api/system/*` pattern) to reattribute the 2026-10-24 match retroactively: replay the webhook's resolution logic (`getTicket` → `customerId` → `Customer` match → attendance update, else `GuestCheckin`) over the 234 unique ticketIds already captured from that match's `scan.created` logs. Idempotent against what the live webhook already wrote (same `if (!attendedEventIds.includes(...))` guard), safe to re-run.

## Out of Scope

- Attributing a guest check-in to a customer after the fact (e.g. if they later register).
- Backfilling matches before 2026-10-24 — no historical scan data exists to backfill from (per `lib/vivenu.ts`'s note that Vivenu's Scans API rejects the account API key).
- Changing which ticket types are considered "guest" vs "fan" — classification is purely "has a resolvable local Customer," not ticket type.

## Technical Approach

- **Layer:** `prisma/schema.prisma` (new model), `app/api/webhooks/vivenu/route.ts` (write path), `lib/customer-reports.ts` + `app/customers/match-activity/page.tsx` (read/display path), one new `app/api/system/*` route for the table creation, one new `app/api/system/*` route for the one-time backfill.
- **Patterns:** follow the existing `app/api/system/migrate-*` one-shot admin route convention — no Prisma migrations in this repo (see memory bank). Webhook write logic stays inside the existing `try/finally` + `db.$disconnect()` shape already in `route.ts`.
- **Backfill data source:** the 234 unique `(ticketId, eventId)` pairs already extracted from today's Vercel runtime logs (`scan.created` deliveries, 2026-10-24 11:50–13:20 UTC) — passed as the backfill route's input rather than re-deriving from logs at request time.
- **Constraints:** the backfill route calls Vivenu's `getTicket` per ticket (throttled, `lib/api-throttle.ts`, same 400ms spacing as everything else) — 234 calls will take ~1.5 minutes; route needs a duration budget accordingly (`maxDuration`).

---

## Questions
<!-- Answered via AskUserQuestion during investigation, before this spec was written. -->

1. How should guest/unlinked check-ins be surfaced in the Match Activity report?
   Answer: New "Guest check-ins" stat card, separate from "Checked in" (known fans) and from no-show math.

2. Where should unlinked check-ins be stored?
   Answer: New lightweight table, `GuestCheckin(eventId, ticketId, scannedAt)`.

3. How should the GitHub issue/branch and the production-facing backfill trigger be handled?
   Answer: Issue + branch created directly (permission approved). Backfill route will be pushed/deployed; the developer triggers the actual production HTTPS call once it's live, not Claude automatically.
