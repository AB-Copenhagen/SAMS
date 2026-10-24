---
ticket: gh-66
branch: feature-gh-66-diagnose-login-role-resolution
summary: Admin/Staff logins failing: role resolution may not match Descope's actual response shape
ticketing: github-issues
---

# Admin/Staff logins failing: role resolution may not match Descope's actual response shape

**Ticket:** [#66](https://github.com/AB-Copenhagen/SAMS/issues/66)
**Type:** bug (live incident)
**Branch:** feature-gh-66-diagnose-login-role-resolution

---

## Context

Multiple users (clee@ab.dk, and an account that should hold Admin) got "Not authorized" on login. Confirmed in production logs: `/api/auth/session` returned 403 at the exact timestamp of a fresh attempt — Descope's own sign-in succeeded, but `resolveAppRole()` found neither `Admin` nor `Staff` in the roles Descope reported.

Checked `@descope/core-js-sdk`'s own types (`node_modules/@descope/core-js-sdk/dist/index.d.ts`): `UserResponse` (the shape `me()` returns) has a top-level `roleNames?: string[]` **and** a separate `userTenants?: UserTenant[]`, where each `UserTenant` has its *own* `roleNames?: string[]`. `lib/descope.ts`'s `verifyDescopeSession` only ever read the top-level field. If AB's Descope project assigns roles within a tenant membership (common setup) rather than directly on the user, the top-level `roleNames` is empty for everyone, regardless of what role they actually hold — which matches an admin-level account failing, not just a one-off provisioning gap.

## Scope

- `lib/descope.ts`: `verifyDescopeSession` now combines `data.roleNames` and `data.userTenants[].roleNames` (flattened) before calling `resolveAppRole`.
- Temporary `console.warn` when the combined role list is still empty, logging the raw `roleNames`/`userTenants` shape — covers the case where this fix doesn't fully explain a given account (a genuine console-side assignment gap). Remove once confirmed resolved.

## Out of Scope

- Any Descope console configuration change.
- Full removal of the temporary warn log — leave it until a follow-up confirms no more empty-role logins show up.
