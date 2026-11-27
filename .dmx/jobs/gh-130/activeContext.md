# Active Context: gh-130

## Open Learnings

(none open — the `headers()` override-order gotcha was promoted to `.dmx/systemPatterns.md`)

## Open Decisions

(none open — resolved in the spec: CI runs lint/test/audit only, not a full `next build` (Vercel's preview deploy already covers that, without needing build secrets in Actions); security headers apply app-wide via CSP `frame-ancestors 'none'` + legacy `X-Frame-Options`, carving out nothing for `/embed/:token` since Next.js's more-specific route match already wins; `effect`/`prisma` advisory tracked via Dependabot rather than forced via a breaking `prisma` downgrade; GitHub account-level settings are a separate, explicitly-confirmed Phase 2, not bundled into this PR)

## Session Notes

- Phase 1 complete: `.github/dependabot.yml`, `.github/workflows/ci.yml`, app-wide security headers in `next.config.js` (carved out from `/embed/:token` via a negative-lookahead `source`, not entry ordering — see Open Learnings), `poweredByHeader: false`, and removal of the unused `sqlite3` dependency (+ its now-dead `overrides` entry). `tsc --noEmit`/`vitest`/`next build` all clean; header behavior empirically verified via `next dev` + `curl` on both a general route and `/embed/[token]`.
- Phase 2 (GitHub repo/account settings) not yet started — no PR needed for it, applied directly once the developer confirms.
