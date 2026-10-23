---
name: admin-portal-ux
description: Usability principles and IA conventions for the admin back-office in media.ab.dk — desktop-first screens where staff manage the asset library and the CRM (players, sponsors, collections, customers, jobs, analytics, configure). Use when restructuring navigation, adding global search, building settings/profile screens, or adding any new admin-only table/detail page.
metadata:
  version: '1.0.0'
---

# Admin back-office UX — media.ab.dk

This covers the *other* persona from `press-worker-usability`: an admin/staff user at a
desk, managing the catalog (assets, players, sponsors, collections) and the customer CRM
(fans via Descope/Goliath/Shopify), not a press contact in the field. Sessions are longer,
screens are wider, and the job is finding/filtering/bulk-acting on records — not finishing
one task in 30 seconds on a phone.

## Current state (read before changing it)

- Nav is a single flat list in `components/NavLinks.tsx` — no section grouping, even though
  `.nav-section` and `.nav-divider` CSS already exist in `app/globals.css` for exactly this.
- No global/cross-entity search exists anywhere. Search is page-local: `/customers`
  (name/email + marketingOptIn/segment/minSpend filters), `/media` (`MediaFilterBar`:
  q/type/season/category/collection/players/sponsors/rating). `/admin`, `/collections`,
  `/jobs`, `/analytics`, `/configure` have none.
- Roles: `ADMIN | STAFF | PLAYER | MEDIA | SPONSOR` (`lib/auth.ts`), helper `isAdmin(user)`.
  Hard `ADMIN`-only routes: `/admin`, `/customers`, `/customers/[id]`, `/analytics`,
  `/jobs` (redirects to `/home`, inconsistently — not `/login` like the others). Everything
  else is open to any logged-in role.
- `/profile` is Descope's own `UserProfile` widget — account/security only, no app
  preferences. `/configure` is where Players/Sponsors/Seasons/Stadiums/Devices get managed,
  which is "catalog settings," a different thing from personal "my profile" settings — don't
  conflate the two when adding a settings area.

## Principles

- **Group nav by domain, not by feature-launch order.** Today's flat list grew in merge
  order (Home, Upload, Quick capture, Media library, Collections, Configure, Jobs,
  Customers, Analytics). Group into something like: Library (Upload, Quick capture, Media
  library, Collections), CRM (Customers), Operations (Jobs, Analytics, Configure) — use the
  already-defined `.nav-section` header style plus `.nav-divider`, don't invent new CSS.
- **Make every ADMIN-only route gate the same way.** `/jobs` redirecting to `/home` while
  `/admin`/`/customers`/`/analytics` redirect to `/login` is an inconsistency that will
  confuse anyone auditing access — pick one behavior (redirecting a logged-in non-admin to
  `/home` is friendlier than bouncing them to `/login`) and apply it everywhere, including
  any new settings sections.
- **Global search must be permission-aware, not a bolt-on index.** If/when cross-entity
  search (assets, customers, players, sponsors, collections) ships, it has to respect the
  same `isAdmin`/role gates as the pages themselves — a STAFF user typing in search must
  never surface a customer record they couldn't reach by navigating to `/customers` directly.
- **Don't build a second settings surface for the same data.** `/configure` already owns
  Players/Sponsors/Seasons/Stadiums/Devices. A new "Settings" area should be for account/app
  preferences (notification prefs, default page size, theme) or org-level config (cron
  schedules, integration key status) — not a rename of `/configure`.
- **List + detail, not list-only.** Follow the shape already used by `/collections` →
  `/collections/[id]`, `/players/[id]`, `/customers` → `/customers/[id]`: a filterable
  table/list page links into a dedicated detail route with its own breadcrumb, rather than
  inline-expanding rows or modals for anything with more than 3-4 fields.
- **One action bar per detail page, top-aligned.** Primary record actions (edit, delete,
  share, re-sync) belong in the page-header area next to the title, consistent with how
  `/customers/[id]` and `/collections/[id]` already place theirs — not scattered as inline
  buttons throughout the page body.
- **Dense, scannable tables for admin lists.** `.asset-table` is the existing convention
  (used by `/admin`, `/customers`) — reuse it for new admin tables rather than building
  cards-as-a-list; cards (`.gallery`) are for field-facing gallery views, not back-office
  record lists.
- **Surface the data a 360° view actually needs.** `/customers/[id]` already pulls Descope +
  Goliath + Shopify into one page — treat that as the bar for any future detail page: don't
  make the admin click between three tabs to see identity, activity, and commercial data for
  one record.

## Conventions to reuse (don't invent new ones)

- Breakpoint: **860px** for sidebar/mobile-drawer collapse (same as `press-worker-usability`).
- `.page-header`, `.page-body`/`.page-body-wide`, `.card`, `.stat-row`/`.stat-card`,
  `.asset-table`/`.asset-table-wrap`, `.tabs`/`.tab-btn`, `.pagination`/`.page-info`,
  `.breadcrumb`, `.sidebar-layout` (list+filters two-column) — all already defined in
  `app/globals.css`; extend them, don't fork a parallel set of classes.
- `.nav-section`/`.nav-divider` exist but are unused for grouping today — this is the
  mechanism for IA regrouping, not ad-hoc headers.
- Styling approach: plain CSS, BEM-ish names, no Tailwind/CSS modules (matches
  `press-worker-usability`).
- Role gating: server-side `getCurrentUser()` + redirect for whole routes; a boolean prop
  passed into a client component for partial gating within a shared page (the `/configure`
  Devices-tab pattern) — see `isAdmin()` in `lib/auth.ts`.

## Before shipping an admin-portal UX change

- Check it doesn't regress a role gate — a STAFF/MEDIA/PLAYER/SPONSOR user should get the
  exact same redirect behavior as before for any route you touch.
- Check new nav groupings or search results against every role, not just ADMIN — most
  routes today are open to any logged-in role.
- Reuse an existing CSS class before adding a new one; if a genuinely new pattern is needed,
  add it to `app/globals.css` near its siblings rather than inlining styles.
