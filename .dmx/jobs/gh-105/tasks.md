# Tasks: Update dependencies for security fixes and routine maintenance

**Spec:** `.dmx/jobs/gh-105/spec.md`
**Branch:** bug-gh-105-update-dependencies-for-security-fixes
**Ticket:** [gh-105](https://github.com/AB-Copenhagen/SAMS/issues/105)
**Status:** In Progress

---

## Phase 1: Security Fixes — Non-Major
- [x] Bump `next` 16.3.8 → 16.4.5 in `package.json`; `npm install`
- [x] Run `npm audit fix` to pick up the non-major `undici` and `fast-uri` fixes
- [x] Run `npm audit` and confirm the `next`/`undici`/`fast-uri` advisories are cleared — 9 remain, all scoped to Phases 2–3
- [x] Full build verified via Vercel preview deploy (`dpl_BnYVE12YnQ1EmWc9bTXXp4y41GyD`, READY, 1m4s build) since local build is blocked on missing dev credentials (`TURSO_DATABASE_URL`, Upstash Redis); smoke-tested homepage route (307, matches prod behavior, no runtime errors in logs)

## Phase 2: `vitest` Major Bump (dev-only)
- [x] Bump `vitest` to 5.1.0 in `package.json`
- [x] **Discovered dependency**: vitest 5.1.0 peer-requires `@types/node@^22.0.0 || >=24.0.0` — pulled Phase 5's `@types/node` 26.6.6 bump forward to unblock install (see Phase 5, marked done there too)
- [x] Clean `node_modules`/`package-lock.json` reinstall was needed (ERESOLVE on the old tree); regenerated Prisma client after (`npx prisma generate`) since the reinstall wiped the generated client
- [x] Fixed new config-loader deprecation warning (vitest 5's `configLoader: 'native'`) by renaming `vitest.config.ts` → `vitest.config.mts`, instead of adding `"type": "module"` project-wide
- [x] Full test suite: 55/55 passing, matches pre-bump baseline
- [x] `npm audit`: vitest/vite/esbuild/tinypool/vite-node/@vitest/mocker advisories all cleared — only `@vercel/oidc`/zod (Phase 3) remain
- [x] Verified via Vercel preview deploy (`dpl_1tVAw4tXVRz7GyUtSqMP2gZuvCTB`, READY)

## Phase 3: `@vercel/oidc` Major Bump
- [x] Checked usage first: no source file imports `@vercel/oidc` directly (only declared in `package.json`; `@vercel/sandbox` carries its own nested copy) — low application risk, flagged as possibly-unused in `activeContext.md` rather than removed (out of scope here)
- [x] Bump `@vercel/oidc` to 4.0.7; `npm install`
- [x] `npm audit`: **0 vulnerabilities** — fully clean
- [x] Typecheck clean, 55/55 tests passing
- [x] Verified via Vercel preview deploy (`dpl_Ejegpqq42Yw5hzj9G7zQCQ9Hrjmc`, READY)

## Phase 4: `typescript` Major Bump
- [x] TypeScript 7 is the native (Go-ported) compiler — ships per-platform optional binary packages (`@typescript/typescript-<platform>`), same shape as esbuild/swc. Worth knowing for CI/lockfile platform coverage.
- [x] Bump `typescript` to 7.0.2; `npm install` — clean, 0 vulnerabilities
- [x] `npx tsc --noEmit` clean, no new type errors
- [x] Full test suite: 55/55 passing
- [x] Verified via Vercel preview deploy (`dpl_5EWLkvZsbjgpqzJbnHb97JWUwofw`, READY) — build's own "Running TypeScript" step finished in 1.67s (down from 4.6s pre-bump, consistent with the native compiler)

## Phase 5: `@types/node` Major Bump
- [x] Done early in Phase 2 (vitest 5's peer dependency required it) — bumped `@types/node` to 26.6.6
- [x] `npx tsc --noEmit` clean, no new type errors

## Phase 6: `@vercel/sandbox` Major Bump
- [x] Checked real usage first: `lib/video-thumbnail.ts` (`Sandbox.create`, `runCommand`, `readFileToBuffer`, `stop`) — confirmed against the `vercel:vercel-sandbox` skill's documented API; call shapes unchanged
- [x] Bump `@vercel/sandbox` to 3.9.1; `npm install`
- [x] **Found a new issue**: 3.9.1 (confirmed latest — no newer patch exists) bundles its own nested `@vercel/oidc@4.0.0` (still in the vulnerable `3.6.0 - 4.0.5` range) with its own vulnerable `zod`/`@vercel/cli-config`, surfacing 4 new high-severity advisories. Fixed by extending the existing `overrides."@vercel/sandbox"` block (same pattern already used for `undici`) to also force `@vercel/oidc` to `^4.0.7` — required a clean `node_modules`/`package-lock.json` reinstall to take effect
- [x] `npm audit`: **0 vulnerabilities** again
- [x] Typecheck clean, 55/55 tests passing
- [x] No unit test exists for `lib/video-thumbnail.ts` and a live run needs a real video + `VIDEO_SANDBOX_SNAPSHOT_ID` — not exercised live; verification relies on clean types against the bumped SDK and the skill-documented API matching
- [x] Verified via Vercel preview deploy (`dpl_4m8eXvfs7KYmaqNarrgFTYv4PUjL`, READY)

## Phase 7: Routine Outdated Packages (within current major)
- [x] `prisma`/`@prisma/client`/`@prisma/adapter-libsql` 7.10.1, `@aws-sdk/*` 3.1164.0, `@descope/core-js-sdk` 2.77.0, `@descope/react-sdk` **2.30.10** (staying within its current major — `latest` 3.5.0 is out of scope), `@upstash/redis` 1.41.0, `@upstash/qstash` 2.12.1, `react-easy-crop` 6.2.4 — all already resolved to target via existing caret ranges during the clean reinstalls in Phases 2/6; no `package.json` edit needed, just confirmed with `npm ls`
- [x] Bump `@libsql/client` 0.17.4 → 0.18.0 explicitly (caret on a `0.x` range doesn't cross the minor, so this one needed an edit)
- [x] Bump `react`/`react-dom` 19.2.8 → 19.3.1 and `@types/react` 19.2.17 → 19.3.0 (devDependency + the pre-existing `overrides` pin, both updated)
- [x] `npm install`: 0 vulnerabilities
- [x] Typecheck clean, 55/55 tests passing
- [x] Verified via Vercel preview deploy (`dpl_GJU7oY8wTfyRrf2fZikk8dpQMfAS`, READY); homepage smoke test returns `307` as expected

## Phase 8: Final Verification
- [x] `npm audit`: **0 vulnerabilities** (all 12 original advisories cleared, no accepted-risk exceptions needed)
- [x] Typecheck clean, 55/55 tests passing
- [x] Full build verified via a final consolidated Vercel preview deploy (`dpl_8G29YH5dfhSDWxSQVhSPriYg44bk`, READY) — local build still blocked on missing dev credentials (pre-existing, unrelated to this ticket)
- [x] Smoke-tested across route types on that deployment, confirming no 500s anywhere: `/api/health` → 200, `/login` → 200, `/customers/list` → 307 (auth redirect, expected unauthenticated), `/admin` → 307 (same), `/api/cron/sync-customers` and `/api/cron/process-ingest-jobs` → 401 (CRON_SECRET correctly enforced, not bypassed), `/s/<fake-token>` → 404 (expected for an invalid share token)
- [x] Confirmed via Vercel request logs: 0 responses ≥500 across the deployment's full traffic window
- [x] Breaking-change learnings recorded in `activeContext.md` throughout (Prisma-client regeneration after reinstall, the `@types/node` phase-dependency, the nested `@vercel/sandbox`→`@vercel/oidc` advisory, `video-thumbnail.ts`'s test-coverage gap)

---
_Generated by /dmx/plan._
