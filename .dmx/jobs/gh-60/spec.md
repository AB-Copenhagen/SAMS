---
ticket: gh-60
branch: feature-gh-60-add-a-top-header-nav-bar-and-improve
summary: Add a top header nav bar and improve global search
ticketing: github-issues
---

# Add a top header nav bar and improve global search

**Ticket:** [#60](https://github.com/AB-Copenhagen/SAMS/issues/60)
**Type:** feature
**Branch:** feature-gh-60-add-a-top-header-nav-bar-and-improve

---

## Context

The admin back-office currently has no top header — all navigation, the Cmd+K global search trigger (`CommandPalette`), and the signed-in user's name/role/sign-out link live inside the left sidebar (`components/SidebarShell.tsx`). As the nav and search surface grow, moving account-level actions into a persistent top header frees the sidebar for pure navigation and gives search more visual prominence, consistent with the admin-portal-ux convention of grouping by domain rather than feature-launch order.

## Scope

- Add a top header bar to the shared layout (`components/AppShell.tsx` / `components/SidebarShell.tsx`), with a right-aligned profile/settings menu — replacing or supplementing today's `.sidebar-footer` user-info + sign-out block (see Question 1).
- Improve the existing global search (`components/CommandPalette.tsx`, `app/api/search/route.ts`) — specific improvements to be pinned down via Question 2.
- Preserve the Cmd+K/Ctrl+K shortcut and existing permission-aware search behavior (customer results only ever returned for `isAdmin(user)`, per `app/api/search/route.ts`).
- Keep the existing 860px sidebar/mobile-drawer collapse breakpoint and `.mobile-topbar` behavior intact, or deliberately replace it (Question 3).
- Reuse existing CSS conventions (`.page-header`, `.sidebar-footer`, `.nav-section`/`.nav-divider` in `app/globals.css`) rather than introducing a parallel class set, per the `admin-portal-ux` skill.

## Out of Scope

- Public share views (`/s/[token]`) — stay outside the authenticated staff shell unless Question 5 says otherwise.
- Rebuilding `/configure` (catalog settings) or the existing `/profile` page's own content.
- A general account-settings redesign beyond wiring the header's entry point — per `admin-portal-ux`, don't conflate `/configure` (catalog settings) with personal/account settings.

## Technical Approach

- **Layer:** presentation/shared layout only. `components/AppShell.tsx` and `components/SidebarShell.tsx` are the entry points; `lib/auth.ts`'s `User` type (`id`, `email`, `name?`, `role`) already carries what a header user-menu needs — no new auth plumbing expected.
- **Patterns:** role gating stays server-side via `getCurrentUser()`/`requireAdmin()` in route layouts — the header is presentational and must not become a new gating mechanism. Follow the existing `.sidebar-footer` → header migration pattern rather than inventing new interaction patterns (dropdown menu for profile/settings/sign-out, consistent with how other menus in this app behave).
- **Constraints:** the 860px breakpoint and `.mobile-topbar` currently own the top-of-viewport space on mobile — adding a second top bar risks stacking two bars on narrow screens; this needs explicit resolution (Question 3) before implementation.
- **Search improvements:** `CommandPalette` already debounces (200ms), hits `/api/search`, and groups results by type (`RECORD_GROUPS`) plus "Go to" nav destinations from `NAV_SECTIONS`. Any UI-only improvement (recent searches, result previews, keyboard nav polish) stays in `CommandPalette.tsx`; anything expanding result types or ranking touches `app/api/search/route.ts` too.

---

## Questions
<!-- Answer each question before running /dmx/plan. -->

1. The sidebar currently shows the user's name/role and sign-out in `.sidebar-footer`. Should the new top header's profile/settings menu **replace** that block entirely, or should the sidebar keep a trimmed version (e.g., sign-out only) for narrow/mobile layouts?
   Answer:

2. "Improvements to global search" — which specific improvement(s) are wanted? e.g. recent/pinned searches, richer result previews, keyboard-navigation polish, new result types, or relocating the Cmd+K trigger itself into the new header.
   Answer:

3. Should the new header coexist with the existing `.mobile-topbar` (used below the 860px breakpoint today), or replace it, so mobile doesn't end up with two stacked top bars?
   Answer:

4. Does "settings" in "profile/settings" mean linking to the existing `/profile` page (Descope widget + `StaffPreference` display prefs), or does it also require a new settings surface distinct from `/configure`?
   Answer:

5. Should the header render on every authenticated route, or only within the main staff shell (excluding `/s/[token]` public share views, which sit outside `AppShell` today)?
   Answer:
