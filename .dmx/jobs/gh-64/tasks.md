# Tasks — gh-64: Allow Staff role to view CRM details

## Phase 1 — Auth helpers + gate changes

- [x] `lib/auth.ts`: add `isStaffOrAdmin(user)` and `requireStaff(user)`, mirroring `isAdmin`/`requireAdmin`.
- [x] Switch the 5 CRM pages from `requireAdmin` to `requireStaff`.
- [x] Switch `app/api/customers/route.ts` and `app/api/customers/[id]/route.ts` from `isAdmin` to `isStaffOrAdmin`.
- [x] `app/api/search/route.ts`: customer results gated by `isStaffOrAdmin`; update its comment.
- [x] `components/NavLinks.tsx`: replace `adminOnly` with `minRole?: 'STAFF' | 'ADMIN'`; update `visibleNavSections` to rank roles instead of a binary admin check; set `minRole: 'ADMIN'` on Jobs/Analytics, `minRole: 'STAFF'` on Customers/Reports/Match activity.
- [x] Update `admin-portal-ux` skill's "Current state" section (hard-ADMIN-only route list).
- [x] (Found during implementation, see activeContext) `lib/staff-preferences.ts`'s `LANDING_PAGE_CHOICES` had the same `adminOnly` pattern for the default-landing-page preference — generalized the same way so Staff can pick `/customers` as their landing page too.

## Phase 2 — Validate

- [x] Typecheck clean.
- [x] Confirm no CRM route still imports `requireAdmin`/`isAdmin` for a view path (mutation/admin-only routes outside CRM untouched) — verified via grep.
