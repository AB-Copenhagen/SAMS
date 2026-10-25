---
ticket: gh-72
branch: feature-gh-72-add-user-staff-admin-roles-and-per-role
summary: Add User/Staff/Admin roles and per-role RBAC for Media, CRM, Settings
ticketing: github-issues
---

# Add User/Staff/Admin roles and per-role RBAC for Media, CRM, Settings

**Ticket:** [#72](https://github.com/AB-Copenhagen/SAMS/issues/72)
**Type:** feature
**Branch:** feature-gh-72-add-user-staff-admin-roles-and-per-role

---

## Context

Descope login currently rejects any session whose Descope roles don't include the exact `Admin` or `Staff` role name (`resolveAppRole` in `lib/descope.ts`), returning a hard 403 ("Your account does not have access to this app.") from `app/api/auth/session/route.ts`. Legitimate `@ab.dk` staff hit this whenever they haven't been manually granted one of those two roles in Descope. We need to admit every `@ab.dk` user by default with a minimal `User` role, and move fine-grained module access out of the login gate into an Admin-managed, role-based permission layer.

## Scope

- Extend the role model from the current two tiers (`ADMIN`, `STAFF`) to three (`USER` default, `STAFF`, `ADMIN`).
- Any Descope session with an `@ab.dk` email authenticates successfully and defaults to `USER` instead of being rejected.
- Only `ADMIN` can change another user's role tier; new Admin-only user management screen to list users and set their tier.
- Per-role module permissions (granularity varies per module: View/Add/Edit/Delete for Media Assets, View/Edit/Delete for CRM, View/Edit for Admin Settings) for three modules: Media Assets, CRM, Admin Settings. Permissions are fixed per role tier — no per-user overrides. See the full matrix in Question 1's answer below.
- Replace the existing `isStaffOrAdmin`/`isAdmin` checks across affected routes/pages (`app/api/customers/*`, `app/configure`, `app/admin`, `app/jobs`, `app/analytics`, `app/api/assets/*`, `app/api/system/*`, and others) with the new module+permission checks.

## Out of Scope

- The consumer-facing "MyAB" Descope project (separate project, read-only for the CRM) — this ticket only touches the staff-login Descope project.
- Per-user permission overrides (explicitly decided against — permissions are role-derived only).
- Any change to device-key auth (`PLAYER`/`MEDIA`/`SPONSOR` labels used for device-credential ownership) — those aren't login roles and aren't part of this ticket's role tiers.
- `app/configure` (seasons/players/sponsors/stadiums/devices) and `app/analytics` — not one of the 3 named modules; stay on today's `isStaffOrAdmin`/`isAdmin` checks, unaffected by this ticket.

## Technical Approach

- `lib/descope.ts` `resolveAppRole` / `AppRole` type: add `USER` as the fallback result for an `@ab.dk` email with no matching `Admin`/`Staff` Descope role, instead of returning `null`.
- `app/api/auth/session/route.ts`: drop the blanket 403 on `role === null`; reject only on domain mismatch (non-`@ab.dk`).
- `lib/auth.ts`: extend `UserRole`; replace ad hoc `isAdmin`/`isStaffOrAdmin` checks with module-aware helpers (e.g. `hasPermission(module, action, user)` where `action` is `'view' | 'add' | 'edit' | 'delete'`) backed by a static per-role permission matrix, consistent with this file's existing centralized-redirect pattern (`requireAdmin`).
- Role storage stays in Descope: `USER` is "no `Admin`/`Staff` Descope role assigned" (no new DB table for role). The Admin user management screen changes a user's role by calling the Descope Management API (same pattern as `descope-customers.ts`'s Management Key usage), not a local DB write.
- User management UI: new Admin-only page, likely alongside `app/admin/page.tsx` or `app/configure`, following existing admin-only page patterns (`requireAdmin` guard).

---

## Questions
<!-- Answer each question before running /dmx/plan. -->

1. What is the View/Edit permission matrix per role tier? E.g. does `USER` get View-only on Media Assets and nothing on CRM/Admin Settings, or no module access until promoted to `STAFF`?
   Answer: Full matrix, confirmed:

   | Module | User | Staff | Admin |
   |---|---|---|---|
   | Media Assets | View+Add+Edit | View+Add+Edit+Delete | View+Add+Edit+Delete |
   | CRM | No access | View only | View+Edit+Delete |
   | Admin Settings (Jobs + user role management) | No access | No access | View+Edit |

   Configure (seasons/players/sponsors/stadiums/devices) and Analytics pages are not one of these 3 named modules — out of scope for this ticket, stay on today's `isStaffOrAdmin`/`isAdmin` checks unchanged.

2. Should role assignment stay in Descope (an Admin changes a user's Descope role via the Management API, as roles are stored today), or move into this app's own database so Admins don't need Descope console access at all?
   Answer: It should stay in Descope

3. What exactly counts as the "Admin Settings" module — today's `app/configure` (seasons/players/sponsors/stadiums/devices) plus `app/admin`, or something narrower? Do `app/jobs` and `app/analytics` fall under Admin Settings, CRM, or their own thing?
   Answer: Admin Settings should be Jobs and editing RBAC for users.

4. The one-shot admin maintenance routes under `app/api/system/*` (schema backfills/migrations) currently require `isAdmin`. Do these stay as a hard Admin-only gate regardless of the new module RBAC, or become part of the Admin Settings module's Edit permission?
   Answer: Yes, keep those isAdmin.

5. Migration: do existing Descope `Admin`/`Staff` users map 1:1 to the new tiers with no action needed, and does every other already-active `@ab.dk` user get silently upgraded to `USER` on their next login with no re-invite step?
   Answer: it should match, but everything with @ab.dk should get upgraded to USER.
