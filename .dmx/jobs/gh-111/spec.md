---
ticket: gh-111
branch: fix-gh-111-sqlite-busy-cron-contention
summary: Widen/jitter SQLITE_BUSY retry budget and reduce cron write pressure so collection-asset writes stop failing
ticketing: github-issues
---

# SQLITE_BUSY still failing collection-asset writes: retry budget too short for cron contention

**Ticket:** [#111](https://github.com/AB-Copenhagen/SAMS/issues/111)
**Type:** bug
**Branch:** fix-gh-111-sqlite-busy-cron-contention

---

## Context

Users still see "Failed to update custom collections — please try again" after both gh-107 (serialize same-request writes, #108) and gh-109 (repo-wide retry/backoff on writes, #110) shipped. #110 has been live in production since 2026-11-15 23:35; the exact same error (`PrismaClientKnownRequestError` P2039 `SQLITE_BUSY`) kept recurring on `POST /api/collections/[id]/assets` as of 2026-11-16 (confirmed via `vercel logs --status-code 500`).

Root cause, confirmed against the live Turso `media` database:
- `PRAGMA busy_timeout` on the remote DB is `0`. `@libsql/client`'s own `Config.timeout` docs confirm why: it "only takes effect for local SQLite databases; remote clients ignore it." There is no engine-level wait available over this remote `libsql://` connection — the only lever is application-level retry.
- gh-109's retry budget (3 attempts, fixed 50/150/400ms, ~600ms total, not jittered) is far too short to survive sustained contention. `app/api/webhooks/vivenu/route.ts` hit the identical SQLITE_BUSY-under-burst problem and needed a much wider, jittered budget (~8s) to actually resolve it in production.
- Sustained contention source: `app/api/cron/sync-customers` (`*/30 * * * *`, `maxDuration = 800`) does a sequential per-customer upsert loop over ~4,800 `Customer` rows, and `app/api/cron/sync-customer-enrichment` runs `*/15 * * * *` on top of it. Production failure timestamps cluster right after each :00/:30 cron trigger.

## Scope
- Widen and jitter the SQLITE_BUSY retry budget in `lib/db.ts` (mirror the vivenu pattern: wider, jittered exponential backoff instead of 3 fixed short delays)
- Reduce `sync-customers` and `sync-customer-enrichment` cron frequency from `*/30`/`*/15` to daily, cutting the number of contention windows per day
- Re-verify against production logs after deploy: no new SQLITE_BUSY/P2039 on `/api/collections/[id]/assets` following a cron run

## Out of Scope
- Changing the DB/driver (Turso/libSQL) or adding connection pooling
- Batching/rewriting the cron's per-customer upsert loop into bulk writes (separate, larger change)
- Any change to collection-type gating or the client-side `updateCustomCollections` sequencing (already fixed in gh-107)

## Technical Approach
- `lib/db.ts`: replace `RETRY_DELAYS_MS = [50, 150, 400]` with a wider, jittered schedule modeled on `BUSY_RETRY_BASE_DELAYS_MS`/`jittered()` in `app/api/webhooks/vivenu/route.ts` (base delays widened toward an ~8s total budget, each jittered so concurrent retries don't resynchronize)
- `vercel.json`: change `sync-customers` and `sync-customer-enrichment` cron `schedule` from `*/30 * * * *`/`*/15 * * * *` to a once-daily schedule (e.g. `0 3 * * *`, staggered so they don't both run at once)
- No schema or infra changes needed

---

## Questions
<!-- Answer each question before running /dmx/plan. -->

(none — developer already specified the fix approach: widen/jitter retry + reduce cron frequency, continuing from investigation already done in chat)
