# Tasks: Fix SQLITE_BUSY 500s when adding/removing custom-collection memberships

**Spec:** `.dmx/jobs/gh-107/spec.md`
**Branch:** fix-gh-107-sqlite-busy-custom-collections
**Ticket:** [gh-107](https://github.com/AB-Copenhagen/SAMS/issues/107)
**Status:** In Progress

---

## Phase 1: Serialize Client-Side Writes
- [x] In `components/AssetDetailClient.tsx`'s `updateCustomCollections`, replace the `Promise.all([...added.map(...), ...removed.map(...)])` with sequential `await`s (e.g. a `for...of` loop over added then removed), checking each response's `ok` and throwing on first failure, same as today
- [x] Confirm the optimistic update (`setCustomCollectionIds(newIds)`) and revert-on-error (`setCustomCollectionIds(customCollectionIds)`) behavior is unchanged — untouched, still wraps the whole sequence

## Phase 2: Serialize Server-Side Bulk Upsert
- [x] In `app/api/collections/[id]/assets/route.ts`, replace `Promise.all(assetIds.map((assetId) => prisma.collectionAsset.upsert(...)))` with a sequential `for...of` loop that awaits each upsert and pushes into a `memberships` array
- [x] Confirm the DELETE route (`app/api/collections/[id]/assets/[assetId]/route.ts`) isn't invoked in a way that races with the POST route in the same burst — it does a single `deleteMany` per request with no internal concurrency; the only races were client-side (fixed in Phase 1) and the bulk upsert loop (fixed here)

## Phase 3: Verify
- [ ] Manually reproduce: add an asset to 3+ custom collections at once from the asset detail page, confirm no 500/toast
- [ ] Manually reproduce: bulk-add 5+ assets to one custom collection from the Media Library, confirm no 500/toast
- [ ] Re-check `vercel logs` after deploying to confirm no new `SQLITE_BUSY`/P2039 entries on this route

---
_Generated manually (dmx MCP server not connected this session) — scaffolded to match the `.dmx/jobs/gh-*` convention from prior tickets._
