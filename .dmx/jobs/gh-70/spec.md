---
ticket: gh-70
branch: feature-gh-70-fix-backfill-prisma-singleton
summary: Site-wide slowness — backfill route exhausted the shared Prisma/libSQL connection
ticketing: github-issues
---

# Site-wide slowness: backfill route exhausted the shared Prisma/libSQL connection

**Ticket:** [#70](https://github.com/AB-Copenhagen/SAMS/issues/70)
**Type:** bug (live incident)
**Branch:** feature-gh-70-fix-backfill-prisma-singleton

---

## Context

Live incident: site-wide slow page loads / timeouts (including a public share link) reported shortly after running the gh-68 backfill twice in close succession. Confirmed `TypeError: fetch failed` / `SocketError: other side closed` errors on unrelated pages (`/customers`, `/collections/[id]`) hitting Prisma and the Vivenu API during background cache revalidation.

`lib/db.ts` has an explicit, pre-existing comment: reusing the shared `prisma` singleton for "many sequential polling queries" on a warm instance has been observed to degrade the libSQL adapter — documented fix is `createPrismaClient()` (disposable, `$disconnect()`'d when done), already used correctly by the webhook handler and the ingest cron. The gh-68 backfill route didn't follow this — ~565 tickets × up to 4 sequential queries each through the shared singleton, run twice concurrently. Matches the documented failure mode exactly, and degraded every route sharing that singleton, not just the backfill.

## Scope

- `app/api/system/backfill-match-checkins-20261024/route.ts`: switched to a disposable `createPrismaClient()` client, `$disconnect()`'d in `finally` — same pattern as `app/api/webhooks/vivenu/route.ts`.

## Out of Scope

- `lib/db.ts` itself.
- Auditing every other route — `add-guest-checkin-table/route.ts` also uses the shared singleton but only runs 2 raw SQL statements, not the "many sequential queries" pattern this bug is about.
