---
ticket: gh-64
branch: feature-gh-64-staff-can-view-crm
summary: Allow Staff role (not just Admin) to view CRM details
ticketing: github-issues
---

# Allow Staff role (not just Admin) to view CRM details

**Ticket:** [#64](https://github.com/AB-Copenhagen/SAMS/issues/64)
**Type:** feature
**Branch:** feature-gh-64-staff-can-view-crm

---

## Context

Came out of investigating login/access reports (clee@ab.dk and others): logins are gated by Descope `Admin`/`Staff` roles (`lib/descope.ts`), but the CRM (`/customers/*`) is currently hard-gated to `ADMIN` only via `requireAdmin()` — a `STAFF` user can log in but has no path to customer data at all. Per the developer: Staff (not just Admin) should be able to view CRM details.

CRM pages are read-only views of synced data (Descope/Goliath/Shopify/Vivenu) — no edit/delete/mutation actions exist on any of them (confirmed: no POST/PUT/DELETE/`<form>` besides a GET filter form on `/customers/list`) — so widening view access doesn't open up any write surface.

## Scope

- Add `isStaffOrAdmin`/`requireStaff` to `lib/auth.ts`, parallel to the existing `isAdmin`/`requireAdmin`.
- Switch these CRM view routes from `requireAdmin` to `requireStaff`: `app/customers/page.tsx`, `app/customers/list/page.tsx`, `app/customers/[id]/page.tsx`, `app/customers/match-activity/page.tsx`, `app/customers/reports/page.tsx`.
- Switch their backing read-only API routes from `isAdmin` to `isStaffOrAdmin`: `app/api/customers/route.ts`, `app/api/customers/[id]/route.ts`.
- `app/api/search/route.ts`: customer search results gated by `isStaffOrAdmin` instead of `isAdmin`, per the `admin-portal-ux` skill's rule that search must respect the same gate as the pages themselves.
- `components/NavLinks.tsx`: generalize the `adminOnly` boolean into a `minRole?: 'STAFF' | 'ADMIN'` field so the CRM nav items (Customers, Reports, Match activity) show for Staff too, while Jobs/Analytics stay Admin-only.
- Update the `admin-portal-ux` skill's "Current state" section (stale list of hard-ADMIN-only routes).

## Out of Scope

- `/admin`, `/analytics`, `/jobs` — stay ADMIN-only; not part of "CRM."
- Any new write/mutation capability on customer records — these stay read-only regardless of role.
- Fixing the underlying Descope role-assignment gaps found during the login investigation (external console action, not a code change).

## Technical Approach

- **Layer:** `lib/auth.ts` (new helpers), the 5 CRM page components, 3 API routes, `components/NavLinks.tsx`, and the `admin-portal-ux` skill doc.
- **Patterns:** mirror `isAdmin`/`requireAdmin` exactly for the new `isStaffOrAdmin`/`requireStaff` pair — same redirect behavior (`/login` for no session, `/home` for wrong role), same type-narrowing signature.
- **Why an explicit role check, not "any logged-in user":** `UserRole` also includes `PLAYER`/`MEDIA`/`SPONSOR`, issued via a separate device-key session path (`app/api/devices/route.ts`), not the Descope staff login — those must NOT gain CRM access just by having *a* session cookie.
- **Nav:** `adminOnly: true` on Jobs/Analytics becomes `minRole: 'ADMIN'`; on Customers/Reports/Match activity becomes `minRole: 'STAFF'`. `visibleNavSections` ranks roles (`ADMIN` > `STAFF`) and compares against an item's `minRole` instead of a binary flag — same mechanism feeds both the sidebar and `HeaderSearch`'s "Go to" results, so no separate change needed there.
