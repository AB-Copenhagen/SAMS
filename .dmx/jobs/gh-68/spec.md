---
ticket: gh-68
branch: feature-gh-68-complete-match-checkin-backfill
summary: Match Activity undercounts 2026-10-24 check-ins — backfill data was incomplete (234 of 565)
ticketing: github-issues
---

# Match Activity undercounts 2026-10-24 check-ins: backfill data was incomplete (234 of 565)

**Ticket:** [#68](https://github.com/AB-Copenhagen/SAMS/issues/68)
**Type:** bug
**Branch:** feature-gh-68-complete-match-checkin-backfill

---

## Context

Developer compared our Match Activity numbers against EventBilletten's own dashboard for today's match (event `6a9ab12d5db87f26931bc8e4`): EB reports **565 unique check-ins**, our app showed only **270**.

Root cause: not a webhook delivery problem. Pulled the full day's `/api/webhooks/vivenu` logs (08:40–13:20 UTC) — **575** `scan.created` deliveries, all 200 OK, **565 unique ticketIds**, all against the same single `eventId` — matches EB's own "Unique checkins: 565" exactly.

The gap is in gh-62's one-shot backfill (`app/api/system/backfill-match-checkins-20261024/tickets.json`): it was built from a narrower log pull (11:50–13:20 UTC only, the window captured during the original investigation) that only contained 234 of the real 565 unique tickets — missing ~331 earlier pre-match check-ins from 08:40–11:50 UTC entirely. Verified the 234 already in the file are a strict subset of the full 565 — no conflicting data, nothing to reconcile, only additions.

## Scope

- Replace `app/api/system/backfill-match-checkins-20261024/tickets.json` with the complete 565-ticket set pulled from the full day's logs.
- No code change in the backfill route itself — already idempotent (skips already-counted customer attendance via the `attendedEventIds.includes` guard, skips already-existing `GuestCheckin` rows via the `findUnique` check), so re-running it against the corrected data file fills in exactly the gap without touching anything already recorded.
- Developer re-triggers `POST /api/system/backfill-match-checkins-20261024` once deployed.

## Out of Scope

- Any change to the webhook handler itself — it was never the problem; it correctly received all 575 deliveries throughout the day.
- Future matches — this is specific to backfilling 2026-10-24's already-played match from already-captured logs.
