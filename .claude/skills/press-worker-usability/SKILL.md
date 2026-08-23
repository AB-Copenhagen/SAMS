---
name: press-worker-usability
description: Usability principles and concrete conventions for designing UI in media.ab.dk (the AB press/media DAM), tailored to busy media and press workers using it under time pressure, often one-handed on a phone. Use when adding or changing any page, component, or CSS in this app — upload, review, tagging, collections, or the public share views.
metadata:
  version: '1.0.0'
---

# Usability for busy media/press workers — media.ab.dk

This app is used by two groups under real time pressure, not casual browsers:

- **Internal staff** (`app/upload`, `app/review`, `app/ingest/mobile`, `app/players`,
  etc.): uploading and tagging photos/video right after a match, often on a phone,
  sometimes mid-event, on stadium wifi.
- **External press/media contacts** (`app/s/[token]`, the public share view): opening a
  share link on their phone to grab a photo for a story on deadline, want the image and
  a download/share action, nothing else.

Every design decision here should be judged against: *does this help someone finish the
task in the next 30 seconds, one-handed, on a phone, possibly on bad wifi?* If a change
adds a step, a modal, or a decision for the common case, that's a cost — justify it.

## Principles, grounded in what's already shipped

- **Collapse secondary actions, don't spread them out.** The public view redesign
  (`components/PublicAssetView.tsx`) replaced a scattered toolbar with a single
  "Save & Share" menu anchored near the image. New action-heavy screens should follow
  that shape: one primary action visible, everything else behind a single
  well-labeled affordance, not five equally-weighted icons.
- **Fixed/floating controls must respect safe areas.** A real shipped bug (close and
  Save & Share buttons vanishing off-screen on mobile) was caused by not accounting for
  notches/home-indicator insets. Any `position: fixed`/`sticky` element near a screen
  edge must use `max(<fallback>, env(safe-area-inset-*))` for its offset — see
  `app/globals.css` around the lightbox close button (`top: max(14px,
  env(safe-area-inset-top))`) for the pattern to copy.
- **Touch targets are 44×44px minimum.** This is already the standard for icon buttons
  in the mobile lightbox (`width: 44px; height: 44px`) — match it for any new tappable
  control reachable on a phone, not just the ones that happen to be big already.
- **Design for one-handed thumb reach.** Primary actions on mobile screens (share,
  download, confirm) belong within easy thumb reach — generally lower/center of the
  viewport — not in a far top corner that needs a stretch or a grip change.
- **Don't rely on hover.** Press/media users are on touch devices in the field. Any
  affordance that only appears `:hover` on desktop needs a touch-visible equivalent —
  see the `@media (hover: none)` blocks in `app/globals.css` for the existing pattern of
  making hover-only UI always-visible on touch.
- **Gestures shouldn't fight the browser.** Custom swipe/pinch handling (the lightbox,
  `lib/useSwipe.ts`) sets `touch-action` explicitly (`pan-y` where vertical scroll should
  still work, `none` where the component fully owns the gesture) so the browser doesn't
  simultaneously try to scroll or zoom underneath it. Any new gesture-driven component
  needs the same explicit `touch-action`.
- **Uploads must survive interruption.** Field uploads happen on unreliable connections
  and get backgrounded mid-transfer. The existing multipart/chunked ingest flow
  (`lib/client-ingest.ts`, `app/api/ingest/sessions/*`) with resumable parts and visible
  per-file progress in the upload queue is the bar — don't add a new upload path that
  regresses to a single opaque request with no progress or resume.
- **Review/triage screens are for scanning, not browsing.** `app/review` and the
  backfill/queue screens are about clearing a queue fast — favor dense grids, clear
  pending-vs-done state, and keyboard/one-tap confirm over multi-step forms for the
  common case (accepting a suggested tag). Reserve confirmation dialogs for actually
  destructive or hard-to-reverse actions (bulk-delete, merge-duplicates), not routine
  approvals.
- **Speed over decoration.** No animation, transition, or skeleton state should make the
  common path feel slower than an instant response would. If a transition exists purely
  for polish, keep it short (the drop-zone's `0.15s` border/background transitions are
  about the right order of magnitude) and never block interaction on it.

## Conventions to reuse (don't invent new ones)

- **Breakpoints**: `860px` (layout/sidebar collapse) and `640px` (phone-specific
  tweaks) are the established breakpoints in `app/globals.css` — reuse them instead of
  picking a new one per component.
- **Design tokens**: reference the CSS custom properties defined in `app/globals.css`'s
  `:root` (`--color-primary`, `--color-primary-hover`, `--color-primary-tint`,
  `--color-accent`, etc.) instead of hardcoding brand hex values in component styles —
  keeps a future rebrand or dark-mode pass a one-file change.
- **Alerts**: reuse `.alert-warning` / `.alert-success` / `.alert-error` rather than
  introducing new status-color combinations.
- **Styling approach**: plain CSS with BEM-ish class names in `app/globals.css` (no
  Tailwind, no CSS modules) — match that convention rather than introducing a second
  styling system for a new component.

## Before shipping a UI change

- Check it at a phone-width viewport (375–414px) as well as desktop — most usage of the
  upload/review flow and effectively all public share-link opens happen on a phone.
- If the change touches a fixed/sticky element or a swipe/pinch interaction, verify it
  by hand against safe-area insets and touch-action, since these are exactly the classes
  of bug that have shipped before in this app.
- Ask: could the busy version of this user (one hand on a camera, on deadline) complete
  the task without reading anything? If not, look for a step to cut before adding
  visual polish.
