---
ticket: gh-105
branch: bug-gh-105-update-dependencies-for-security-fixes
summary: Update dependencies for security fixes and routine maintenance
ticketing: github-issues
---

# Update dependencies for security fixes and routine maintenance

**Ticket:** [#105](https://github.com/AB-Copenhagen/SAMS/issues/105)
**Type:** bug
**Branch:** bug-gh-105-update-dependencies-for-security-fixes

---

## Context
A routine `npm audit` + `npm outdated` pass (2026-11-07) found 12 vulnerabilities (3 critical, 5 high, 4 moderate) plus several routine version gaps. Most severe: a critical unauthenticated RCE in `next`'s Image Optimization API (SVG handling) and in `use cache` typed-array deserialization, both in the installed range 16.0.0–16.4.0. Also checked Vercel production runtime logs over the available 6h retention window — no application errors, just benign 404s and one WAF-blocked scanner probe; not a driver for this ticket.

## Scope
- Bump `next` 16.3.8 → 16.4.5 (non-major) — fixes GHSA-2464-fhr4-w9xw (unauthenticated RCE via SVG image optimization), GHSA-673q-mjm6-r5xr (unauthenticated RCE via `use cache` typed arrays), GHSA-p3m5-59mp-jv5r (Server Actions DoS)
- `npm audit fix` for non-major fixes: `undici` (cache poisoning via cross-origin redirects, TLS certificate validation bypass), `fast-uri` (scheme/host confusion)
- Bump `vitest` 2.1.9 → 5.1.0 (dev-only, semver-major) — resolves the `vite`/`esbuild`/`tinypool`/`vite-node`/`@vitest/mocker` vulnerability chain
- Bump `@vercel/oidc` 3.8.1 → 4.0.7 (semver-major) — resolves nested `zod` memory-exhaustion DoS
- Update routine outdated packages (non-vulnerable): `prisma`/`@prisma/client` (patch), `react`/`react-dom`, `@aws-sdk/*`, `@libsql/client`, `@descope/core-js-sdk`, `@descope/react-sdk`, `@upstash/redis`, `@upstash/qstash`, `@types/react`
- Bump `typescript` 5.9.3 → 7.0.2 (major)
- Bump `@types/node` 20.19.43 → 26.6.6 (major)
- Bump `@vercel/sandbox` 2.9.0 → 3.9.1 (major)

## Out of Scope
- `prisma` → 8.0.0-rc.33 (release candidate, not stable) — staying on 7.x until a stable 8.x ships
- Any unrelated work on `feature-gh-91-sync-and-display-goliath-app-engagement` (separate ticket, separate branch)

## Technical Approach
- Apply in separable commits so a regression is easy to bisect: (1) `next` bump, (2) `npm audit fix` for non-major fixes, (3) `vitest` major bump, (4) `@vercel/oidc` major bump, (5) routine outdated packages
- Re-run `npm audit` after each step to confirm the targeted advisory clears and nothing new appears
- `vitest`, `@vercel/oidc`, `typescript`, `@types/node`, and `@vercel/sandbox` are all semver-major — check each package's changelog/migration notes for breaking changes before bumping, since `fixAvailable.isSemVerMajor: true` (or no audit entry at all, for the non-vulnerable majors) means npm won't do this automatically
- `typescript` 7.x is a new major compiler version — run a full typecheck after bumping and expect to fix new type errors, not just update the dependency
- `vitest` is dev-only (test runner) — run the full test suite after bumping to catch config/API breakage
- `next` is the production framework — run a full local build and smoke-test key flows (customer list/detail, auth, uploads, share links) before merging, given the RCE fixes touch Image Optimization and `use cache`
- Bundled into one PR per developer decision (not fast-tracked separately) — sequence commits with `next` and the audit-fix (non-major, lower risk) first, then the major bumps, so a regression is still easy to bisect

---

## Questions
<!-- Answer each question before running /dmx/plan. -->

1. Is it acceptable to defer the `typescript` 7.x, `@types/node` 26.x, and `@vercel/sandbox` 3.x major bumps to separate tickets, as scoped above, rather than bundling them here?
   Answer: No — bundle them into this ticket.

2. For the `next` bump specifically — given the fixed CVEs are RCE-class — do you want this merged and deployed ahead of the rest of the ticket (split into its own fast-tracked PR), or is bundling it with the other four groups into one PR acceptable?
   Answer: Bundle it with the rest.

3. `prisma`'s latest available version is `8.0.0-rc.33` (release candidate, not stable) — include it in this ticket?
   Answer: No — stay on 7.x stable; only the 7.10.0 → 7.10.1 patch applies here.
