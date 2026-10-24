# Tasks — gh-64: Allow Staff role to view CRM details

## Phase 1 — Auth helpers + gate changes

- [ ] `lib/auth.ts`: add `isStaffOrAdmin(user)` and `requireStaff(user)`, mirroring `isAdmin`/`requireAdmin`.
- [ ] Switch the 5 CRM pages from `requireAdmin` to `requireStaff`.
- [ ] Switch `app/api/customers/route.ts` and `app/api/customers/[id]/route.ts` from `isAdmin` to `isStaffOrAdmin`.
- [ ] `app/api/search/route.ts`: customer results gated by `isStaffOrAdmin`; update its comment.
- [ ] `components/NavLinks.tsx`: replace `adminOnly` with `minRole?: 'STAFF' | 'ADMIN'`; update `visibleNavSections` to rank roles instead of a binary admin check; set `minRole: 'ADMIN'` on Jobs/Analytics, `minRole: 'STAFF'` on Customers/Reports/Match activity.
- [ ] Update `admin-portal-ux` skill's "Current state" section (hard-ADMIN-only route list).

## Phase 2 — Validate

- [ ] Typecheck clean.
- [ ] Confirm no CRM route still imports `requireAdmin`/`isAdmin` for a view path (mutation/admin-only routes outside CRM untouched).
