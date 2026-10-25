# Tasks: Add User/Staff/Admin roles and per-role RBAC for Media, CRM, Settings

**Spec:** `.dmx/jobs/gh-72/spec.md`
**Branch:** feature-gh-72-add-user-staff-admin-roles-and-per-role
**Ticket:** [gh-72](https://github.com/AB-Copenhagen/SAMS/issues/72)
**Status:** In Progress

---

## Phase 1: Role Model & Login Gate

- [x] `lib/descope.ts`: add `'USER'` to the `AppRole` type; change `resolveAppRole` to return `'USER'` instead of `null` when no `Admin`/`Staff` role name matches (keep Admin-before-Staff priority)
- [x] `lib/descope.ts`: add an `isAllowedEmailDomain(email)` helper checking the `@ab.dk` suffix (case-insensitive), overridable via an env var the way `DESCOPE_ADMIN_ROLE`/`DESCOPE_STAFF_ROLE` already are
- [x] `app/api/auth/session/route.ts`: drop the `if (!role) return 403` branch; instead reject with 403 only when `!isAllowedEmailDomain(descopeUser.email)` ("Your account's email domain is not allowed.")
- [x] `lib/auth.ts`: extend `UserRole` to include `'USER'`

## Phase 2: Permission Matrix & Helpers

- [x] `lib/auth.ts`: add `Module = 'media' | 'crm' | 'adminSettings'` and `PermissionAction = 'view' | 'add' | 'edit' | 'delete'` types
- [x] `lib/auth.ts`: add a static `PERMISSION_MATRIX: Record<Module, Record<UserRole, PermissionAction[]>>` encoding the confirmed table from spec.md Question 1 (Media: User=view/add/edit, Staff/Admin=view/add/edit/delete; CRM: User=none, Staff=view, Admin=view/edit/delete; Admin Settings: User/Staff=none, Admin=view/edit)
- [x] `lib/auth.ts`: add `hasPermission(user: User | null, module: Module, action: PermissionAction): boolean`
- [x] `lib/auth.ts`: add `requirePermission(user: User | null, module: Module, action: PermissionAction): User`, following the existing `requireAdmin` redirect pattern (no session → `/login`, lacks permission → `/home`)
- [x] `lib/auth.ts`: update the comment above `isStaffOrAdmin` to note it (and `isAdmin`) now exist only for the non-module checks in `app/api/system/*` (spec Question 4), not for module gating

## Phase 3: Media Assets RBAC Enforcement

- [ ] `app/api/assets/[id]/route.ts`: GET uses `hasPermission(user, 'media', 'view')`; PUT and PATCH use `hasPermission(user, 'media', 'edit')` in place of `isAdmin`; DELETE uses `hasPermission(user, 'media', 'delete')` in place of `isAdmin`
- [ ] `app/api/assets/bulk-delete/route.ts`: replace `isAdmin` with `hasPermission(user, 'media', 'delete')`
- [ ] `app/api/assets/backfill-face-tags/route.ts` and `app/api/assets/backfill-manual-tags/route.ts`: replace their current role check with `hasPermission(user, 'media', 'edit')`
- [ ] `app/api/collections/[id]/route.ts`: GET uses `hasPermission(user, 'media', 'view')`; the share-setting fields in PATCH use `hasPermission(user, 'media', 'edit')`; DELETE uses `hasPermission(user, 'media', 'delete')`, replacing their `isAdmin` checks

## Phase 4: CRM RBAC Enforcement

- [ ] `app/api/customers/route.ts`: replace `isStaffOrAdmin` with `hasPermission(user, 'crm', 'view')`
- [ ] `app/api/customers/[id]/route.ts`: replace `isStaffOrAdmin` with `hasPermission(user, 'crm', 'view')` on GET; any mutation handler in this file uses `hasPermission(user, 'crm', 'edit')`
- [ ] `app/api/search/route.ts`: replace the `isStaffOrAdmin(user)` check gating customer results with `hasPermission(user, 'crm', 'view')`
- [ ] `app/customers/*` pages (dashboard, list, `[id]`, match-activity, reports): add a `requirePermission(user, 'crm', 'view')` guard at the top of each page, replacing any existing staff/admin check

## Phase 5: Admin Settings RBAC Enforcement

- [ ] `app/jobs/page.tsx`: replace `requireAdmin` with `requirePermission(user, 'adminSettings', 'view')`
- [ ] Confirm `app/api/system/*` routes are left untouched on `isAdmin` per spec Question 4 (no code change — record as verified in this phase, not a separate ticket)

## Phase 6: Admin User Management UI

- [ ] `lib/descope.ts`: add `listStaffUsers()` — pages through the staff project's users via the Search Users Management API (`POST https://api.descope.com/v2/mgmt/user/search` with `Authorization: Bearer {projectId}:{DESCOPE_SERVICE_ACCOUNT_KEY}`), mirroring `iterateAllCustomers` in `lib/descope-customers.ts`; returns each user's id, email, name, and resolved `AppRole`/`'USER'`
- [ ] `lib/descope.ts`: add `setUserRole(userId: string, role: 'ADMIN' | 'STAFF' | 'USER')` using the Descope Management API's role add/remove endpoints to remove both `Admin`/`Staff` role names and add the target one (no role added for `'USER'`)
- [ ] `app/api/admin/users/route.ts` (new): `GET` returns `listStaffUsers()`, gated with `requirePermission(user, 'adminSettings', 'view')`
- [ ] `app/api/admin/users/[id]/role/route.ts` (new): `PATCH` calls `setUserRole`, gated with `requirePermission(user, 'adminSettings', 'edit')`; validates the posted role is one of `'ADMIN' | 'STAFF' | 'USER'`
- [ ] `app/admin/users/page.tsx` (new): Admin-only page listing users with a role selector per row, calling the new PATCH route; guarded with `requirePermission(user, 'adminSettings', 'edit')`
- [ ] Add a nav entry to the new Admin → Users page in the existing admin/sidebar navigation component

## Phase 7: Tests & Validation

- [ ] Unit test `resolveAppRole` in `lib/descope.ts`: returns `'ADMIN'`/`'STAFF'` as before, and now `'USER'` instead of `null` for an empty/non-matching role list
- [ ] Unit test `hasPermission` in `lib/auth.ts` against the full matrix from spec.md (all 3 modules × 3 roles × relevant actions)
- [ ] Manual verification: an `@ab.dk` Descope user with no Admin/Staff role can log in and lands at the default page with `USER`-level access
- [ ] Manual verification: a non-`@ab.dk` email is still rejected at `/api/auth/session`
- [ ] Manual verification: Staff can view but not edit/delete a CRM customer record; User gets no CRM access at all
- [ ] Manual verification: Admin can change a user's role via the new Admin → Users page and the change takes effect on that user's next session

---
_Generated by /dmx/plan. Edit freely — this is your implementation contract._
