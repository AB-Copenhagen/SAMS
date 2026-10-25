# Tasks: Replace Descope-role/domain login gate with an invite-based local user roster

**Spec:** `.dmx/jobs/gh-76/spec.md`
**Branch:** feature-gh-76-replace-descope-role-domain-login-gate
**Ticket:** [gh-76](https://github.com/AB-Copenhagen/SAMS/issues/76)
**Status:** In Progress

---

## Phase 1: Data Model & Backfill

- [x] Add a `StaffUser` model to `prisma/schema.prisma`: `email` (`@id`), `role` (`USER`/`STAFF`/`ADMIN`), `status` (`PENDING`/`ACTIVE`/`SUSPENDED`), `descopeUserId` (nullable), `name` (nullable), `invitedBy` (nullable), `invitedAt`, `updatedAt`
- [x] New `app/api/system/migrate-staff-users/route.ts`: `CREATE TABLE IF NOT EXISTS "StaffUser"` via raw SQL, following the exact pattern in `app/api/system/migrate-staff-preferences/route.ts` (gated by today's `isAdmin`, still Descope-role-based at this point in the rollout — unaffected until Phase 3)
- [x] Same route: idempotently seed `zsmith@ab.dk` as `role=ADMIN`, `status=ACTIVE` if no row exists yet (spec Question 3) — this is the row that must exist in production before Phase 3 ships, or the next deploy locks everyone out

## Phase 2: Staff User Domain Logic

- [x] New `lib/staff-users.ts`: `StaffUserRecord` type; pure `resolveLoginDecision(record: StaffUserRecord | null): { allowed: boolean; role?: AppRole }` (no row or `SUSPENDED` → not allowed; `PENDING`/`ACTIVE` → allowed with that row's role) — kept pure/testable per the repo's functional-first style, no Prisma/IO inside it
- [x] Same file: IO functions backed by `lib/db.ts` Prisma — `findStaffUserByEmail(email)`, `markActive(email, { descopeUserId, name })` (flips `PENDING` → `ACTIVE`, fills in `descopeUserId`/`name`), `listStaffUsers()`, `inviteStaffUser(email, role, invitedBy)`, `setStaffUserRole(email, role)`, `setStaffUserStatus(email, status)`

## Phase 3: Login Gate Cutover

- [x] `app/api/auth/session/route.ts`: replace the `isAllowedEmailDomain`/`resolveAppRole` gate with `findStaffUserByEmail(descopeUser.email)` + `resolveLoginDecision`; reject (403) when not allowed; on `PENDING`, call `markActive` with the Descope session's `id`/`name` before issuing the cookie
- [x] Drop the session cookie's `maxAge` from 90 days to 24 hours — the `Set-Cookie` call in `app/api/auth/session/route.ts` (not `lib/auth.ts`; `createSessionCookie` there just signs the payload, it doesn't set `maxAge`), per spec's suspension-timing decision
- [x] (found during implementation, not in original plan) `lib/auth.ts`'s `getCurrentUser()` has a second, independent gate: its "raw Descope session token" legacy fallback path called `resolveAppRole` directly, bypassing `app/api/auth/session/route.ts` entirely — a suspended or never-invited user could still get in through it. Cut over to the same `findStaffUserByEmail`/`resolveLoginDecision` check.
- [x] (found during implementation, not in original plan) New `vitest.config.ts` setting a placeholder `TURSO_DATABASE_URL` — `lib/db.ts` constructs a `PrismaClient` at module-import time, so `lib/auth.ts` now transitively throwing on import under test (via `lib/staff-users.ts`) broke `lib/auth.test.ts`'s 37 passing assertions; also needed ahead of Phase 5's new `lib/staff-users.test.ts`

## Phase 4: Admin Invite UI

- [x] `app/api/admin/users/route.ts`: `GET` returns `listStaffUsers()` from the local table (no more Descope Management API call); `POST` creates a new invite — body `{ email, role }`, calls `inviteStaffUser(email, role, invitedBy: currentAdmin.email)`, status `PENDING`; 409 on a duplicate email instead of a raw 500
- [x] Replace `app/api/admin/users/[id]/role/route.ts` with `app/api/admin/users/[id]/route.ts`: `PATCH` with body `{ role? , status? }`, where `[id]` is the `StaffUser`'s email (URL-encoded); calls `setStaffUserRole`/`setStaffUserStatus` as applicable
- [x] `components/UserRoleSelect.tsx`: update to `PATCH /api/admin/users/{email}` with `{ role }` instead of the old `{ loginId, role }` shape against `/api/admin/users/{userId}/role`
- [x] New `components/StaffUserStatusSelect.tsx`: Active/Suspended selector per row, `PATCH`es `{ status }` to the same route, following `UserRoleSelect`'s confirm/refresh pattern
- [x] New `components/InviteStaffUserForm.tsx`: email input + role select, `POST`s to `/api/admin/users`, `router.refresh()` on success
- [x] `app/admin/users/page.tsx`: render the invite form above the table; add a Status column (`StaffUserStatusSelect`) alongside the existing role column; table now reflects the local roster, including `PENDING` invites who've never logged in

## Phase 5: Descope Cleanup & Tests

- [x] `lib/descope.ts`: remove `listStaffUsers`, `setUserRole`, their `StaffUser`/`RawStaffUser` types, `STAFF_USER_PAGE_SIZE`, and the now-unused `mgmtHeaders`/`managementKey` helpers (keep `requireProjectId` — still used by `getSdk`; keep `resolveAppRole`/`isAllowedEmailDomain`/`DESCOPE_ADMIN_ROLE`/`DESCOPE_STAFF_ROLE`/`DESCOPE_ALLOWED_DOMAIN` as inert leftovers per spec Question 4)
- [x] Unit test `resolveLoginDecision` in `lib/staff-users.test.ts`: no row → rejected; `PENDING` → allowed with role; `ACTIVE` → allowed with role; `SUSPENDED` → rejected
- [ ] Manual verification (after the Phase 1 migrate/backfill route has been run in production, before or atomically with Phase 3's deploy): `zsmith@ab.dk` logs in as the seeded Admin; a never-invited email is rejected regardless of domain; a `PENDING` invite becomes `ACTIVE` on first login; a `SUSPENDED` user is rejected within 24h of being suspended (their existing cookie expires and re-login is blocked)

---
_Generated by /dmx/plan. Edit freely — this is your implementation contract._
