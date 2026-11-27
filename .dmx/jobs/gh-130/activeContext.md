# Active Context: gh-130

## Open Learnings

(none open — the `headers()` override-order gotcha was promoted to `.dmx/systemPatterns.md`)

## Open Decisions

(none open — resolved in the spec: CI runs lint/test/audit only, not a full `next build` (Vercel's preview deploy already covers that, without needing build secrets in Actions); security headers apply app-wide via CSP `frame-ancestors 'none'` + legacy `X-Frame-Options`, carving out nothing for `/embed/:token` since Next.js's more-specific route match already wins; `effect`/`prisma` advisory tracked via Dependabot rather than forced via a breaking `prisma` downgrade; GitHub account-level settings are a separate, explicitly-confirmed Phase 2, not bundled into this PR)

## Session Notes

- Phase 1 complete: `.github/dependabot.yml`, `.github/workflows/ci.yml`, app-wide security headers in `next.config.js` (carved out from `/embed/:token` via a negative-lookahead `source`, not entry ordering — see Open Learnings), `poweredByHeader: false`, and removal of the unused `sqlite3` dependency (+ its now-dead `overrides` entry). `tsc --noEmit`/`vitest`/`next build` all clean; header behavior empirically verified via `next dev` + `curl` on both a general route and `/embed/[token]`. Committed (`e3ef93b`) and PR opened: https://github.com/AB-Copenhagen/SAMS/pull/131.
(the two CI-workflow gotchas found on PR #131's first real run — missing `prisma generate` before `tsc`, and `npm audit --omit=dev` not excluding peer/optional edges — were promoted to `.dmx/techContext.md`'s gh-130 entry)
- Phase 2 complete, applied directly via `gh api` (no PR, per spec): enabled Dependabot security updates (alerts were already on), secret scanning + push protection, and added the CI workflow's `test` check to `main`'s required status checks alongside `Vercel` — only after confirming on PR #131 that it actually passes post-fix. Per the developer's explicit answer, `required_approving_review_count` (0) and `enforce_admins` (false) were reported but left unchanged.
