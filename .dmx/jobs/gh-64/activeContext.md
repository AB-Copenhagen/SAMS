# Active Context — gh-64

## Open Learnings

- [repo-wide] Found a second, parallel `adminOnly` boolean beyond `components/NavLinks.tsx`: `lib/staff-preferences.ts`'s `LANDING_PAGE_CHOICES` (default landing page preference on `/profile`) also gated `/customers` to `ADMIN` only. Not called out in the original spec's Scope, but leaving it `ADMIN`-only would mean a Staff user can view the CRM but can't set it as their landing page (silently falls back) — same dead-end-inconsistency problem the spec already called out for search. Generalized it the same way (`minRole` instead of `adminOnly`, exported `roleAllowsLandingChoice`), touching `lib/staff-preferences.ts`, `app/profile/page.tsx`, `app/api/profile/preferences/route.ts`, `components/ProfileClient.tsx`.
- [repo-wide] `NavLinks.tsx` and `staff-preferences.ts` each keep their own small `ROLE_RANK`/role-check rather than sharing one from `lib/auth.ts` — `lib/auth.ts` imports `next/headers`, so a client component (`NavLinks.tsx`, `'use client'`) can't import from it. Pre-existing pattern (NavLinks already didn't import `isAdmin`), kept it rather than introducing a client/server split module for two lines of logic.

## Open Decisions

(none open)
