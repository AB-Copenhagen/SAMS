---
ticket: gh-120
branch: feature-gh-120-enable-posthog-web-analytics
summary: Enable PostHog web analytics (pageviews and events)
ticketing: github-issues
components: []
---

# Enable PostHog web analytics (pageviews and events)

**Ticket:** [#120](https://github.com/AB-Copenhagen/SAMS/issues/120)
**Type:** feature
**Branch:** feature-gh-120-enable-posthog-web-analytics

---

## Context

gh-115/gh-118 deliberately scoped PostHog to session replay + exception capture only — `lib/posthog.ts` explicitly sets `autocapture: false` and `capture_pageview: false`, so no pageview/event analytics are currently collected. This ticket widens that scope to also enable PostHog's standard web analytics for the staff app.

## Scope

- `lib/posthog.ts`: turn on pageview capture, correctly handling Next.js App Router's client-side (History API) navigation — not just the first full page load.
- Keep scoped to the staff-authenticated app only — never `/s/[token]` or `/login`, the same boundary replay already uses.
- `.dmx/techContext.md`: document the change.

## Out of Scope

- Session replay (gh-115) and exception capture (gh-118) — unaffected, already live.
- Any new PostHog product beyond pageview/event analytics (no feature flags, no A/B experiments).

## Technical Approach

- Next.js App Router navigates client-side, so a plain `capture_pageview: true` (the posthog-js default, full-page-load-only) would miss most navigation in this app. The standard documented approach is either `capture_pageview: 'history_change'` at init, or a manual `posthog.capture('$pageview')` call wired to `usePathname`/`useSearchParams` changes (PostHog's own recommended Next.js App Router pattern uses the latter, in a small client component mounted once near the root).
- `autocapture` (automatic click/form/input tracking) is a separate toggle from pageview capture — the ticket title says "pageviews and events," so this needs a decision on whether "events" means autocaptured interactions too, or just pageview navigation events.
- Mount point: same as gh-115/gh-118 — inside `AppShell`/`PostHogProvider`, so `/s/[token]` and `/login` stay excluded automatically.

---

## Questions

<!-- Answer each question before running /dmx/plan. -->

1. Does "events" in this ticket mean PostHog's `autocapture` (automatic click/form/input tracking), or just the pageview/navigation events themselves? Those are two separate config toggles. pageview and navigation only
2. Pageviews will be tied to the identified staff user (`person_profiles: 'identified_only'`, already set) the same way replay sessions are — is per-user-identified analytics the intent, or should this be anonymous/aggregate only? we can show it by logged in user
3. Any specific pages/flows you're trying to understand usage of (e.g. which reports get viewed, upload funnel drop-off), or is this a general "turn on standard pageview tracking" with no particular analysis goal yet? Nothing specific yet
