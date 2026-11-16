---
ticket: gh-109
branch: bug-gh-109-add-retry-backoff-for-sqlite-busy-on
summary: Add retry/backoff for SQLITE_BUSY on collection writes
ticketing: github-issues
---

# Add retry/backoff for SQLITE_BUSY on collection writes

**Ticket:** [#109](https://github.com/AB-Copenhagen/SAMS/issues/109)
**Type:** bug
**Branch:** bug-gh-109-add-retry-backoff-for-sqlite-busy-on

---

## Context

gh-107 (PR #108, merged 2026-11-12) fixed same-request `SQLITE_BUSY` 500s on custom-collection membership writes by serializing concurrent `prisma` calls into sequential `for...of`/`await` loops, instead of adding retry/backoff. Checking production logs after that fix (`vercel logs`, 2026-11-16) still shows 3 fresh `SQLITE_BUSY` 500s on `POST /api/collections/[id]/assets`, from 3 distinct request IDs within ~90 seconds, all against the same collection, on a deployment that already includes the gh-107 fix. Serializing writes within one request doesn't stop two *different* concurrent requests (e.g. two users, or two browser tabs) from colliding against Turso/libSQL's single-writer DB — a case gh-107 explicitly scoped out.

## Scope
- Retry/backoff (or `busy_timeout`) handling for `SQLITE_BUSY` (Prisma code `P2039`), applied repo-wide via `lib/db.ts` (e.g. a Prisma middleware/extension on the shared `prisma` client) rather than per-route, scoped to writes only (not reads)
- Apply it to the collection-membership write paths: `app/api/collections/[id]/assets/route.ts` (POST), `app/api/collections/[id]/assets/[assetId]/route.ts` (DELETE), and `components/AssetDetailClient.tsx`'s `updateCustomCollections`
- Fix `app/api/collections/[id]/rules/[ruleId]/route.ts`'s DELETE handler, which still wraps two concurrent `prisma` writes (`collectionPlayerRule.deleteMany`, `collectionSponsorRule.deleteMany`) in `Promise.all` — same root-cause pattern gh-107 fixed elsewhere; serialize this one too
- Update the `.dmx/techContext.md` constraint note (currently: "There is no retry/busy_timeout handling anywhere in `lib/db.ts` — the fix is to avoid concurrent writers, not to retry around them") once the new approach lands

## Out of Scope
- Changing the DB/driver (Turso/libSQL) or adding connection pooling
- Any change to collection-type gating or the membership write semantics themselves (purely additive `CollectionAsset` rows) — unrelated to this bug

## Technical Approach
- `lib/db.ts` is the single `prisma` export, constructed at module-import time (see techContext.md constraint) — a retry wrapper most likely belongs around this client or as a small helper other write call sites call into, rather than duplicated per-route
- Follows this repo's functional-first style: keep the retry/backoff decision (how many attempts, what delay) as a small pure/testable unit, isolate the actual IO retry loop at the edge
- `app/api/collections/[id]/rules/[ruleId]/route.ts`'s fix is the same pattern already applied in gh-107: sequential `for...of`/`await` instead of `Promise.all`

---

## Questions
<!-- Answer each question before running /dmx/plan. -->

1. How many retry attempts / what backoff schedule (fixed delay vs. exponential) do you want for `SQLITE_BUSY`?
   Answer: 3 attempts, exponential backoff (~50ms, 150ms, 400ms).

2. Should the retry wrapper apply to every `prisma` write repo-wide, or only to the collection-membership/rule routes named in Scope?
   Answer: Repo-wide, via `lib/db.ts` — not duplicated per-route.

3. If all retries are exhausted, should the route still return the existing "please try again" 500 behavior, or something else (e.g. a distinct status/message so the client can tell a real failure from a now-rare exhausted-retry case)?
   Answer: Keep the existing 500 + message behavior; no client-visible change.
