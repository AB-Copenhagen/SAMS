# Active Context: gh-113

## Open Learnings
_None pending promotion — the snapshot mechanism and its ID-only-walk rationale were written directly into `.dmx/techContext.md` during implementation, not left in the inbox._

## Session Notes
- Implemented the `DescopeUserSnapshot` table, daily capture (`captureDailySnapshot`, wired into `sync-customers`'s `finally` block), a one-shot backfill route for pre-feature `addedCount` history, and the CRM reports-page chart/table. Full test suite (65/65) and `tsc --noEmit` pass.
- A `/dmx/review` pass found and fixed two issues before the PR was opened: a same-day re-run self-diff bug (today's own row could be picked up as "previous"), and `iterateAllUserIds` duplicating `iterateAllCustomers`'s fetch logic instead of reusing it.
- Last task (post-deploy: run the migrate + backfill routes once against production, then confirm a real snapshot row) deferred until this branch merges and deploys.
- PR opened for: Track Descope user counts over time (added/lost) with CRM chart and metrics table.
