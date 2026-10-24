# Tasks — gh-68: Complete the 2026-10-24 match check-in backfill

## Phase 1 — Correct the backfill data

- [x] Pulled full-day `/api/webhooks/vivenu` logs (08:40–13:20 UTC): 575 deliveries, 565 unique ticketIds — matches EB's dashboard exactly.
- [x] Verified the existing 234-ticket file is a strict subset of the full 565 (no conflicts).
- [x] Replaced `app/api/system/backfill-match-checkins-20261024/tickets.json` with the complete 565-entry set.
- [x] Typecheck clean.

## Phase 2 — Re-run (developer-driven, post-deploy)

- [ ] `POST /api/system/backfill-match-checkins-20261024` again — idempotent, will only add the ~331 previously-missing tickets.
- [ ] Confirm `/customers/match-activity?date=2026-10-24` now shows `checkedIn + guestCheckins` close to 565 (some gap is expected: away-team/internal tickets not tied to a Customer are `guestCheckins`, not `checkedIn`, and EB's 565 counts every approved scan regardless of type).
