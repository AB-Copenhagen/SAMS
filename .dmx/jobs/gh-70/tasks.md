# Tasks — gh-70: Fix backfill route's shared Prisma singleton

## Phase 1 — Fix

- [x] `app/api/system/backfill-match-checkins-20261024/route.ts`: use `createPrismaClient()` + `$disconnect()` instead of the shared `prisma` singleton.
- [x] Typecheck clean.

## Phase 2 — Confirm recovery (developer-driven, post-deploy)

- [ ] Reload the previously-timing-out share link and a few CRM pages; confirm normal speed.
- [ ] Watch logs for further `SocketError`/`fetch failed` occurrences.
- [ ] If the shared singleton is still degraded on existing warm instances after deploy, a fresh deploy/instance cycle should clear it — this fix only prevents recurrence, it doesn't itself reset an already-degraded live connection.
