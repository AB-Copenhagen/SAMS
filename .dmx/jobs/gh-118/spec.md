---
ticket: gh-118
branch: feature-gh-118-explicitly-enable-posthog-session
summary: Explicitly enable PostHog session recording and add error tracking
ticketing: github-issues
components: []
---

# Explicitly enable PostHog session recording and add error tracking

**Ticket:** [#118](https://github.com/AB-Copenhagen/SAMS/issues/118)
**Type:** feature
**Branch:** feature-gh-118-explicitly-enable-posthog-session

---

## Context

gh-115 shipped PostHog session replay relying on the PostHog project's default "record sessions" setting being on. That PostHog project is now shared with the public website too, so session replay was turned off by default at the project level — this app's replay silently stopped working as a side effect. Separately, error tracking (so a captured exception links to the replay playing at that moment) was explicitly left out of gh-115's scope.

## Scope

- `lib/posthog.ts`: explicitly start session recording for the staff app (e.g. `posthog.startSessionRecording()`), independent of the PostHog project-level default.
- `app/global-error.tsx`: Next.js App Router global error boundary reporting uncaught client exceptions via `posthog.captureException`, reusing `lib/posthog.ts`'s existing client.
- Session recording stays scoped to the staff-authenticated app only — never `/s/[token]` or `/login`. Client-side error capture (`global-error.tsx`) covers the whole media.ab.dk app including those routes (see Q1 — acceptable since media.ab.dk is already its own app, separate from the public www.ab.dk site the PostHog-project change was about).
- Server-side error reporting: wire `posthog.captureException`-equivalent server-side capture into the 5 cron routes' (`app/api/cron/*/route.ts`) existing `catch` blocks — these are exactly the kind of silently-swallowed failure this ticket exists to surface (see gh-115/gh-113's `DescopeUserSnapshot` incident). Broader app-wide server-side error instrumentation (every API route) is explicitly not attempted in this ticket; a follow-up can widen it once this lands.
- Best-effort masking on captured exception messages (see Q3) — not a guarantee against all possible PII in a stack trace or variable value, which can't be reliably scrubbed automatically.
- `.dmx/techContext.md`: document that session recording is now explicitly enabled in code rather than via the project default, and that server-side error capture now exists for the cron routes.

## Out of Scope

- Server-side error reporting for routes beyond the 5 cron routes (e.g. every `app/api/**/route.ts`) — explicitly deferred to a follow-up.
- Re-litigating who gets recorded — gh-115 already decided replay is on for every staff login; this ticket just changes *how* it's turned on (explicit call vs. project default), not *who*.
- Any new PostHog capability beyond session recording + exception capture (no feature flags, no product analytics/autocapture).

## Technical Approach

- `posthog-js`'s project-level "record sessions" toggle being off doesn't stop `posthog.startSessionRecording()` from working client-side — it forces recording on for that client instance regardless of the dashboard default, as long as the client hasn't set `disable_session_recording: true` (ours doesn't). Call it from `components/PostHogProvider.tsx`'s existing `useEffect`, right after `identifyStaffUser`, so it only fires once the staff session is known.
- `app/global-error.tsx` must stay a client component (`'use client'`) per Next.js's own convention for this file, importing the shared client from `lib/posthog.ts` rather than a fresh `import posthog from 'posthog-js'` — that's exactly what PostHog's auto-generated wizard PR (#116, closed) got wrong: a second ad-hoc init path with the wrong region and env var name.
- `lib/posthog.ts` likely needs a small exported accessor (e.g. `getPostHogClient()`) alongside the existing `identifyStaffUser`, since `global-error.tsx` needs the client instance directly to call `.captureException()`, not just the identify helper.
- `/s/[token]` and `/login` stay excluded from session *recording* the same way gh-115 achieved it: neither route renders `AppShell`/`PostHogProvider`. `app/global-error.tsx` is a route-root boundary and does cover those routes for exception capture only — confirmed acceptable per Q1.
- Server-side capture needs a *different* client than `lib/posthog.ts` — `posthog-js` is a browser SDK and isn't meant to run in Node/serverless route handlers. Use the official `posthog-node` package in a new `lib/posthog-server.ts`, mirroring `lib/posthog.ts`'s lazy-init-with-env-var-guard pattern, with its own EU host config. Flush explicitly (`posthog.flush()`/`shutdown()`) before the function returns, since serverless functions can be frozen/killed right after the response — an unflushed event can simply be lost.
- A shared helper (e.g. `redactErrorMessage(message: string): string`) does best-effort masking (strip obvious email/token-shaped substrings) before either client-side or server-side capture calls `captureException` — applied to the message only; stack frames and arbitrary variable values aren't scrubbed, since that can't be done reliably.

---

## Questions

<!-- Answer each question before running /dmx/plan. -->

1. `app/global-error.tsx` is a single, app-root error boundary in Next.js — there's no way to scope it to "staff pages only" the way `AppShell`-mounted session replay is scoped. Is it acceptable for uncaught client exceptions on `/s/[token]`/`/login` to also be reported (just the exception + stack, no session replay or PII — those routes still won't be recorded), or should we guard `captureException` itself to only fire when a staff session cookie is present?
   Answer: let's scope this for the media.ab.dk site (separate app) which is separate app from the public website (www.ab.dk)

2. Should server-side route-handler/cron errors also be reported to PostHog via `posthog.captureException` from server code, or is this ticket's error tracking client-side only (`global-error.tsx`)?
   Answer: yes, ideally

3. Should captured exceptions get the same masking treatment as session replay (in case an error message or stack trace incidentally contains customer data), or is a raw stack trace acceptable here since it's for engineering debugging, not analytics?
   Answer: yes, we can mask these.
