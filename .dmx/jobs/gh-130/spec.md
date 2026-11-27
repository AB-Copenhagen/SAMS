---
ticket: gh-130
branch: feature-gh-130-security-hardening-ci-dependabot-headers
summary: Security hardening: CI gate, Dependabot, security headers, dependency cleanup
ticketing: github-issues
---

# Security hardening: CI gate, Dependabot, security headers, dependency cleanup

**Ticket:** [#130](https://github.com/AB-Copenhagen/SAMS/issues/130)
**Type:** feature
**Branch:** feature-gh-130-security-hardening-ci-dependabot-headers

---

## Context

Follow-up to a full security review (code + GitHub repo settings + production response headers) requested by the developer. The review surfaced: no automated dependency/CI scanning (no `dependabot.yml`, no CI workflow beyond the Claude review bot), no app-wide security headers (only `/embed/:token` sets `frame-ancestors`, added for gh-123), a devDependency-only `npm audit` finding (`effect`/ReDoS via `prisma`), an unused `sqlite3` dependency, and several GitHub repo/account settings left at their defaults (secret scanning, push protection, Dependabot security updates, branch protection) on a public repo.

## Scope

- `.github/dependabot.yml` (npm + github-actions ecosystems)
- A CI workflow (`tsc --noEmit`, `vitest`, `npm audit`) running on every PR
- App-wide security headers in `next.config.js`, without weakening the existing `/embed/:token` `frame-ancestors` allowlist
- Remove the unused `sqlite3` dependency
- (Phase 2, no PR) Enable GitHub's native Dependabot security updates/alerts and secret scanning/push protection; add the new CI check to required branch-protection status checks

## Out of Scope

- Rewriting the `effect`/`prisma` devDependency chain itself (tracked via Dependabot once enabled, not hand-patched now — no non-breaking fix is available today; `npm audit fix --force` would downgrade `prisma` to 6.12.0, a breaking change not worth forcing for a build-tool-only, non-runtime advisory)
- Changing `required_approving_review_count`/`enforce_admins` — flagged for the developer to revisit with their team, not changed unilaterally
- A `SECURITY.md` / responsible-disclosure policy — a low-priority process item, not bundled into this otherwise code/settings-focused ticket unless asked

## Technical Approach

- `.github/dependabot.yml`: `package-ecosystem: npm`, weekly schedule, `groups` for minor/patch bumps into one PR to cut review noise; a second `package-ecosystem: github-actions` entry (weekly) so action versions in `.github/workflows/*.yml` stay current too.
- New `.github/workflows/ci.yml`: triggers on `pull_request` against `main`, runs `npm ci`, `npx tsc --noEmit`, `npm run test` (vitest), and `npm audit --omit=dev --audit-level=high` (the existing `vitest.config.mts` already sets a placeholder `TURSO_DATABASE_URL` so the test suite's DB-adjacent imports don't throw at import time — no new env var needed for this). Does not attempt a full `next build` in CI — that needs real `TURSO_DATABASE_URL`/Wasabi/etc. credentials this workflow has no reason to hold, and Vercel's own preview deployment (already a required status check) is the existing, working build-verification step; duplicating it in Actions would just be a second place for build secrets to leak from.
- `next.config.js`: add a second `headers()` matcher for `/:path*` excluding `/embed/:token` — Next.js's `headers()` always applies the most specific matching source, so an explicit `/embed/:token` entry (already present) takes precedence over a general `/:path*` one without needing exclusion syntax. New headers: `X-Frame-Options: DENY` (legacy clients) + `Content-Security-Policy: frame-ancestors 'none'` (the app has no legitimate reason to be framed anywhere outside the embed feature), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`. Also set `poweredByHeader: false` at the top level.
- Remove `sqlite3` from `package.json` `dependencies` (confirmed zero references in the app via grep) and run `npm install` to update `package-lock.json`.
- Phase 2 (GitHub settings, applied directly via `gh api`/web UI once the developer confirms, not part of this PR): `gh api -X PATCH repos/{owner}/{repo} -f security_and_analysis[...]` for Dependabot security updates and secret scanning/push protection; update branch protection's `required_status_checks.contexts` to also require the new `CI` workflow.
