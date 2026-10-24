# Tasks — gh-66: Fix Descope role resolution

## Phase 1 — Fix + diagnostic logging

- [x] `lib/descope.ts`: combine `data.roleNames` and `data.userTenants[].roleNames` in `verifyDescopeSession`.
- [x] Add temporary `console.warn` for the still-empty case.
- [x] Typecheck clean.

## Phase 2 — Confirm in production (developer-driven, post-deploy)

- [ ] Retry a previously-failing login; confirm it now succeeds.
- [ ] Check logs for any remaining `[descope] no roles resolved` warnings — those are real per-account console gaps, not this bug.
- [ ] Once confirmed clean for a few days, remove the temporary warn log.
