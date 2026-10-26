---
ticket: gh-76
branch: feature-gh-76-replace-descope-role-domain-login-gate
summary: Replace Descope-role/domain login gate with an invite-based local user roster
ticketing: github-issues
---

# Replace Descope-role/domain login gate with an invite-based local user roster

**Ticket:** [#76](https://github.com/AB-Copenhagen/SAMS/issues/76)
**Type:** feature
**Branch:** feature-gh-76-replace-descope-role-domain-login-gate

---

## Context

`listStaffUsers()` (gh-72) hits Descope's Management API rate limit (`E130429`) because it re-queries and paginates the entire Descope user directory on every `/admin/users` page view, with no caching. Separately, the domain-based auto-admit policy (`isAllowedEmailDomain`, any `@ab.dk` email) doesn't match the intended model going forward: access should be invite-only, for any email domain, with Descope used purely to verify the person's identity/session at login — not to decide who's allowed in or what role they have.

## Scope

- A new local table, SAMS's own user roster, replacing Descope's user directory as the source of truth for "who can log in" and "what role they have."
- Admin → Users becomes an invite flow: an Admin adds a person by any email address and assigns a role (`User`/`Staff`/`Admin`) up front, before that person has necessarily ever logged in.
- The login gate (`app/api/auth/session/route.ts`) checks the local roster by email instead of `isAllowedEmailDomain` — no domain restriction, any email can be invited.
- Role resolution for `hasPermission`/`requirePermission`/`PERMISSION_MATRIX` (gh-72) is sourced from the local roster's role column instead of Descope role names.
- A one-shot backfill so currently-active users don't lose access the moment this ships (see Questions).

## Out of Scope

- Changing anything about the Customer CRM's separate Descope project/sync (`lib/descope-customers.ts`, the consumer "MyAB" project) — this ticket only touches the staff-login project's access model.
- Per-user module-permission overrides — still role-tier-only, per gh-72's existing decision (`PERMISSION_MATRIX`/`hasPermission` logic is unchanged, just re-sourced).
- Device-key auth (`PLAYER`/`MEDIA`/`SPONSOR`) — unrelated to staff login.

## Technical Approach

- New Prisma model `StaffUser`, shipped as a one-shot admin route per this repo's no-`prisma migrate` convention (`app/api/system/migrate-*` pattern, like `migrate-staff-preferences`). Keyed by **email**, not Descope `userId` — unlike `Customer` (whose id is a Descope userId, because every customer already has a Descope account by the time SAMS sees them), an invited-but-not-yet-logged-in user has no Descope identity yet. Fields: `email` (id), `role` (`USER`/`STAFF`/`ADMIN`), `status` (`PENDING`/`ACTIVE`/`SUSPENDED`), `descopeUserId` (nullable, populated on first successful login), `invitedBy`, `invitedAt`, `name` (nullable, populated from Descope on first login).
- Status lifecycle: a new invite is created `PENDING`; it flips to `ACTIVE` on that email's first successful login (session route updates the row). An Admin can set a row to `SUSPENDED` at any time — enforced by the session-route lookup, checked only at login (not per-request). To bound how long a suspended user can keep using an already-issued cookie, `lib/auth.ts`'s session cookie `maxAge` drops from 90 days to **24 hours** (`createSessionCookie`'s `Set-Cookie` in `app/api/auth/session/route.ts`) — a suspension takes effect the next time that person's cookie expires and they're forced to re-authenticate, within a day, not up to 90 days.
- `app/api/auth/session/route.ts`: replace the `isAllowedEmailDomain`/`resolveAppRole`-based gate entirely with a `StaffUser` lookup by the Descope session's email. No matching row → reject; row status `SUSPENDED` → reject; row status `PENDING` or `ACTIVE` → allow, role from the row, and if `PENDING` flip it to `ACTIVE` with `descopeUserId`/`name` populated.
- `lib/descope.ts`'s `resolveAppRole`/`isAllowedEmailDomain` and the `DESCOPE_ADMIN_ROLE`/`DESCOPE_STAFF_ROLE`/`DESCOPE_ALLOWED_DOMAIN` env vars are left in place but become dead code on the login path (per Question 4) — not removed, just unused by `app/api/auth/session/route.ts` going forward.
- `listStaffUsers()`/`setUserRole()` (gh-72, hit Descope's Management API) are removed/replaced by local `StaffUser` CRUD (`lib/db.ts`/Prisma) — no more live Descope directory queries from `/admin/users`, which is what actually fixes the rate limiting.
- `app/admin/users/page.tsx` / `components/UserRoleSelect.tsx`: extend into an invite form (email + role) that creates a `PENDING` `StaffUser` row, a status selector (Active/Suspended) alongside the existing per-row role editor, now against the local table instead of Descope.
- One-shot backfill script/admin route seeding exactly `zsmith@ab.dk` as `ADMIN`/`ACTIVE` (Question 3) — must ship and run before or atomically with the session-route gate change, or the very first deploy locks everyone out.
- Invite notification is explicitly silent for this ticket (Question 1) — no email integration work now; a future ticket can add it (Mailgun was mentioned, not Mailerlite — a new, not-yet-integrated provider).

---

## Questions
<!-- Answer each question before running /dmx/plan. -->

1. Invite notification: when an Admin invites someone, does SAMS send them anything (an email saying "you now have access," reusing the existing MailerLite integration), or is it silent — the person just discovers they can log in?
   Answer: It can be silent, we can add mail sending via MailGun later.

2. Revocation: can an Admin remove/deactivate a roster row to cut off access immediately? Should that also need to kill any currently-active session for that user, or is "rejected on their next request" sufficient?
   Answer: yes, they should be able to set to active/suspended

3. Rollout backfill: to avoid locking out everyone (including the Admins who'd need the new invite UI to invite everyone else) the moment this ships, who gets auto-seeded into the new roster before the gate flips — everyone currently resolvable via gh-72/gh-75's domain-filtered Descope list, or just the current Descope Admin/Staff role holders, with everyone else (today's auto-admitted `@ab.dk` Users) needing an explicit re-invite?
   Answer: Seed exactly one row: `zsmith@ab.dk`, role `ADMIN`, status `active`. Nobody else is auto-migrated — every other current user (including existing Descope Admin/Staff holders) needs an explicit invite from this seeded Admin after deploy.

4. Disposition of the now-unused Descope role config: once role lives in the local table, do we leave `DESCOPE_ADMIN_ROLE`/`DESCOPE_STAFF_ROLE`/`DESCOPE_ALLOWED_DOMAIN` and the Descope console role assignments alone as inert leftovers, or actively clean them up (remove the env vars, document that Descope Console roles no longer matter for this project)?
   Answer: Clarified — the local roster's role column is the single source of truth for in-app permissions; the app no longer reads Descope's Admin/Staff console roles to determine anything. `DESCOPE_ADMIN_ROLE`/`DESCOPE_STAFF_ROLE`/`DESCOPE_ALLOWED_DOMAIN` and `resolveAppRole`/`isAllowedEmailDomain` stay in the codebase/config as inert leftovers (not actively removed), kept in case of future use, but become dead code for the login/permission path.

5. Acceptance state: does an invited row need a pending → active state machine (e.g. "invited" until their first successful login, then "active"), or is being present in the table with an assigned role sufficient the moment it's created — no separate acceptance step?
   Answer: yes, pending, active, suspended
