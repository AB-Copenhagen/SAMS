# Active Context — gh-62

## Open Learnings

- [repo-wide] `noShow` in `getMatchActivityUncached` (`lib/customer-reports.ts`) is now `ticketsSold - checkedIn - guestCheckins`, not `ticketsSold - checkedIn` as the spec's Scope bullet literally says ("no-show math is unaffected"). The spec's own wording was self-contradictory: it also says "guests were never counted as no-shows," which only holds if `guestCheckins` is subtracted. Kept the behavior that's actually correct — a guest who checked in isn't a no-show — rather than the literal (narrower) sentence.
- [repo-wide] The cross-match trend report (`getMatchAttendanceUncached`, feeding `/customers/reports`'s bar chart) does NOT get a guest-checkins breakout — out of scope per spec, only the live `/customers/match-activity` view was touched.

## Open Decisions

- The `app/api/system/backfill-match-checkins-20261024/route.ts` admin route is deployed but intentionally not invoked by Claude — developer triggers the one production HTTPS call once this branch is live, per explicit agreement during this ticket.
