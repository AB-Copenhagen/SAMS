# Tasks: SQLITE_BUSY still failing collection-asset writes: retry budget too short for cron contention

**Spec:** `.dmx/jobs/gh-111/spec.md`
**Branch:** fix-gh-111-sqlite-busy-cron-contention
**Ticket:** [gh-111](https://github.com/AB-Copenhagen/SAMS/issues/111)
**Status:** In Progress

---

## Phase 1: Widen/Jitter the Retry Budget
- [x] In `lib/db.ts`, replace the fixed `RETRY_DELAYS_MS = [50, 150, 400]` with a wider, jittered schedule modeled on `app/api/webhooks/vivenu/route.ts`'s `BUSY_RETRY_BASE_DELAYS_MS`/`jittered()` (base delays widened toward an ~8s total budget)
- [x] Update `lib/db.test.ts` to cover the new delay schedule/jitter behavior for `getBusyRetryDelayMs` (keep it a pure, unit-tested function per the existing pattern)
- [ ] Update the `.dmx/techContext.md` SQLITE_BUSY note once this lands (handled at commit/create-pr time, not here)

## Phase 2: Reduce Cron Write Pressure
- [x] In `vercel.json`, change `sync-customers`'s schedule from `*/30 * * * *` to once daily (`0 3 * * *`)
- [x] In `vercel.json`, change `sync-customer-enrichment`'s schedule from `*/15 * * * *` to once daily, staggered from `sync-customers` (`0 4 * * *`)
- [x] Confirm no code (routes, docs, alerts) assumes the old 15/30-minute freshness window for these crons — grepped repo-wide; the only dependent code is `lib/customer-query.ts`'s 300s dashboard cache TTL, which stays correct (still far under a daily cadence), just its comment's "every 30 minutes" framing is now stale (left as-is, not a correctness issue)

## Phase 3: Verify
- [x] Run unit tests (`lib/db.test.ts` + full suite) to confirm the new retry schedule behaves as expected — 61/61 pass; `npx tsc --noEmit` clean
- [ ] Deploy and re-check `vercel logs --status-code 500` after the next cron run to confirm no new SQLITE_BUSY/P2039 entries on `/api/collections/[id]/assets`
