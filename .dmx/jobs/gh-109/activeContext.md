# Active Context: gh-109

## Open Learnings
_None pending promotion — the retry/backoff behavior and the `AppPrismaClient` typing fallout were written directly into `.dmx/techContext.md` as part of this ticket's explicit Scope, not left in the inbox._

## Session Notes
- Implemented repo-wide `SQLITE_BUSY` retry/backoff in `lib/db.ts` (Prisma client extension, 3 attempts exponential backoff: ~50/150/400ms), serialized the remaining `Promise.all` write in the collection rules DELETE route, added `lib/db.test.ts`, and updated `techContext.md`. Full test suite (60/60) and `tsc --noEmit` pass. Last task (post-deploy production log verification) deferred until this branch merges and deploys.
- PR opened for: Add retry/backoff for SQLITE_BUSY on collection writes.
