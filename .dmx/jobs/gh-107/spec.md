---
ticket: gh-107
branch: fix-gh-107-sqlite-busy-custom-collections
summary: Fix SQLITE_BUSY 500s when adding/removing custom-collection memberships
ticketing: github-issues
---

# Fix SQLITE_BUSY 500s when adding/removing custom-collection memberships

**Ticket:** [#107](https://github.com/AB-Copenhagen/SAMS/issues/107)
**Type:** bug
**Branch:** fix-gh-107-sqlite-busy-custom-collections

---

## Context

Users intermittently see "Failed to update custom collections — please try again" when adding/removing an asset's custom-collection memberships. Confirmed from production logs (`vercel logs`, last 24h): repeated 500s against `POST /api/collections/[id]/assets`, all the same error:

```
Error [PrismaClientKnownRequestError] (P2039):
SQLITE_BUSY: SQLite error: database is locked
  at prisma.collectionAsset.upsert()
```

Two call sites fire concurrent writes against the Turso/libSQL-backed DB (`lib/db.ts`), which has single-writer semantics:
- `components/AssetDetailClient.tsx`'s `updateCustomCollections` — fires one `fetch` per added/removed collection via `Promise.all`.
- `app/api/collections/[id]/assets/route.ts`'s bulk `assetIds[]` branch — turns a multi-asset add into its own `Promise.all` of individual `prisma.collectionAsset.upsert()` calls.

No retry/backoff or `busy_timeout` handling exists anywhere in `lib/db.ts` or these routes today (confirmed via repo-wide search).

## Scope
- Serialize the membership-write requests client-side in `updateCustomCollections` (sequential awaits instead of `Promise.all`)
- Serialize the bulk `assetIds[]` upsert loop server-side in `app/api/collections/[id]/assets/route.ts` (sequential loop instead of `Promise.all`)
- Verify the DELETE route (`app/api/collections/[id]/assets/[assetId]/route.ts`) isn't also issuing concurrent writes in the same request burst

## Out of Scope
- Any retry/backoff mechanism for `SQLITE_BUSY` (developer decision: serialize writes instead, not retry)
- Changing the DB/driver (Turso/libSQL) or adding connection pooling
- Any change to collection-type gating (unrelated; confirmed no type-based guard exists on this path)

## Technical Approach
- Client: change `updateCustomCollections` in `components/AssetDetailClient.tsx:277-296` to `for...of` sequential `await`s over `added`/`removed`, preserving the existing optimistic-update + revert-on-error behavior
- Server: change the `Promise.all(assetIds.map(...))` in `app/api/collections/[id]/assets/route.ts:20-26` to a sequential `for...of` loop building up `memberships`
- No schema or infra changes needed

---

## Questions
<!-- Answer each question before running /dmx/plan. -->

(none — developer already specified the fix approach: serialize writes, new branch/ticket)
