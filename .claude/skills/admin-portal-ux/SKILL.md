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

- Nav is grouped into Library / CRM / Operations sections in `components/NavLinks.tsx`, using
  `.nav-section`/`.nav-divider` — the same `NAV_SECTIONS` array also feeds the command
  palette's "Go to" results (`components/CommandPalette.tsx`).
- Global search exists: `Cmd+K`/`Ctrl+K` opens `CommandPalette`, which hits
  `app/api/search/route.ts` for cross-entity results (assets/players/sponsors/collections for
  any logged-in role; customers only when `isAdmin(user)` — never queried otherwise). Page-local
  filters still exist too: `/customers/list` (name/email + consent/segment/minSpend, now a
  left-side filter rail, not a top bar), `/media` (`MediaFilterBar`: q/type/season/category/
  collection/players/sponsors/rating).
- Roles: `ADMIN | STAFF | PLAYER | MEDIA | SPONSOR` (`lib/auth.ts`), helper `isAdmin(user)`.
  `requireAdmin(user)` is the standard gate for a whole ADMIN-only route — redirects a
  logged-in non-admin to `/home`, no session at all to `/login`, consistently. Hard
  `ADMIN`-only routes: `/admin`, `/customers`, `/customers/list`, `/customers/[id]`,
  `/analytics`, `/jobs`. Everything else is open to any logged-in role.
- `/profile` has both Descope's `UserProfile` widget (account/security) and app-level display
  preferences (theme, default page size, default landing page — `lib/staff-preferences.ts`,
  `StaffPreference` table). `/configure` is where Players/Sponsors/Seasons/Stadiums/Devices get
  managed, which is "catalog settings," a different thing from personal "my profile"
  settings — don't conflate the two when adding a settings area.
- `/customers` is a **dashboard** (KPI tiles, sync health, top segments/spenders, recent
  logins) — the table itself lives at `/customers/list`. This is the reference shape for any
  future CRM-adjacent entity with enough going on to warrant an overview before the raw list
  (see "Pair a dashboard with a list" below).

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
- **Pair a dashboard with a list once an entity has more than one angle worth seeing.**
  `/customers` (KPIs + sync health + top segments/spenders + recent activity) →
  `/customers/list` (the filterable table) is the reference shape: the list stays reachable
  one click away ("Browse all X →" in the dashboard's `page-header`), and a dashboard that's
  cron/sync-fed shows the sync's own health (last run status/time/processed count per source —
  see `getCachedCustomerDashboard` in `lib/customer-query.ts`), not just counts of the data it
  produced, so a page full of `—`s is self-explanatory instead of looking broken.
- **Stay honest about what's actually editable.** A synced/read-only record (the Customer CRM
  record, sourced from Descope/Goliath/Shopify) should look read-only — status chips, not
  editable-looking dropdowns; no "owner"/"assign"/"add contact" affordances implying a manual
  workflow this app doesn't have. Save dropdown-style inline-editable fields for data this app
  actually owns and writes (Players/Sponsors/Seasons in `/configure`).
- **Color is for scanability on dense people-lists, not branding.** The customer list's
  per-row avatar colors (`--avatar-color-*` in `app/globals.css`, hashed from the customer id
  in `app/customers/list/page.tsx`) are a deliberately separate palette from the AB brand
  colors (`--ab-*`) — don't pull avatar colors into brand-facing UI, and don't reuse
  `--color-primary`/`--color-accent` for a new per-row-color need instead of extending this
  palette.

## Conventions to reuse (don't invent new ones)

- Breakpoint: **860px** for sidebar/mobile-drawer collapse (same as `press-worker-usability`).
- `.page-header`, `.page-body`/`.page-body-wide`, `.card`, `.card-header`, `.config-list`/
  `.config-item`/`.config-item-info` (title+sub stacked inside a row — the info wrapper is
  required, `.config-item` itself is a flex row), `.stat-row`/`.stat-card`, `.dashboard-row`
  (a handful of equal-width summary cards, auto-fit), `.asset-table`/`.asset-table-wrap`,
  `.tabs`/`.tab-btn`, `.pagination`/`.page-info`, `.breadcrumb`, `.sidebar-layout` (main content
  + a 380px aside, aside **second**/right — used by `/media`) vs. `.customer-layout` (a 240px
  rail **first**/left + main content — used by `/customers/list`; a separate class precisely
  because it flips the aside to the other side, which would change `/media`'s layout if done
  by modifying `.sidebar-layout` instead) — all already defined in `app/globals.css`; extend
  them, don't fork a parallel set of classes.
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
