---
ticket: gh-115
branch: feature-gh-115-add-posthog-session-replay-for-the
summary: Add PostHog session replay for the staff app
ticketing: github-issues
components: []
---

# Add PostHog session replay for the staff app

**Ticket:** [#115](https://github.com/AB-Copenhagen/SAMS/issues/115)
**Type:** feature
**Branch:** feature-gh-115-add-posthog-session-replay-for-the

---

## Context

Staff use the DAM and Customer CRM under time pressure (often one-handed on a phone, sideline/press-box). There's currently no visibility into how staff actually move through the UI, where they stall, or what fails silently client-side. Session replay gives qualitative insight to validate against the press-worker-usability conventions this app already follows.

## Scope

- Provision PostHog via the Vercel Marketplace integration (`vercel integration add posthog`) — real provisioning, not a hand-wired SDK key.
- Client-side PostHog init + session replay (recording) for the authenticated staff app (DAM + Customer CRM pages).
- Gate initialization behind the existing staff session/auth check (`lib/auth.ts`) so recording only starts for logged-in staff.
- Mask/exclude sensitive CRM fields (fan PII: contact info, spend, ticket history) from recordings.
- Document new env vars in `.env.example` and `techContext.md`.

## Out of Scope

- The public `/s/[token]` share views — external, unauthenticated visitors (fans, press) outside the staff auth gate. Not recorded.
- The standalone `tools/sams-ingest` CLI — not a browser surface, nothing to record.
- Product analytics/event tracking beyond what's needed to enable replay (feature flags, A/B tests) — PostHog supports these, but this ticket is replay only unless scope is explicitly widened.

## Technical Approach

- Run `vercel integration add posthog --yes --no-claim` (project already linked to Vercel team `zsmith-8629`); if a dashboard/browser claim step is required, surface that to the developer to complete, then `vercel env pull --yes`.
- Initialize `posthog-js` in a client component, likely alongside the existing auth-gated shell (`AppShell.tsx` / `TopHeader.tsx` pattern) rather than in `app/layout.tsx` directly, so it's easy to scope to staff-only routes and skip `/s/[token]`.
- Follow the existing pattern for browser-only SDKs that wrap custom elements / have hydration concerns (`components/DescopeLoginForm.tsx`, `components/ProfileClient.tsx` use `next/dynamic(..., { ssr: false })`) if PostHog's replay recorder has similar SSR constraints — verify against PostHog's Next.js docs during implementation.
- Use PostHog's input/text masking config (`maskAllInputs` / per-element masking) to exclude CRM PII fields from recordings, rather than disabling replay on those pages entirely, unless masking proves insufficient.
- Identify the staff user to PostHog (`posthog.identify`) using the same session data `lib/auth.ts` already resolves, so replay sessions can be correlated with role (`USER`/`STAFF`/`ADMIN`) without adding a new identity source.

---

## Questions

<!-- Answer each question before running /dmx/plan. -->

1. Should session replay capture the Customer CRM pages at all (they show fan PII: spend, tickets, contact info), or should replay be DAM-only to start, with CRM added later once masking is verified?
   Answer:  Let's not store PII, this is just for debug and related.

2. Does PostHog need EU-only data residency here, consistent with this app's existing GDPR carefulness (AWS Rekognition is pinned to the EU region for biometric face vectors)?
   Answer:  Yes, EU data

3. Should recording be on by default for every staff login, or gated behind a toggle (e.g. an env var kill switch, or a per-user/per-role opt-out) given it records screens of people doing their jobs?
   Answer: Yes, for staff logins this should be on.

4. Any sampling/retention requirement to manage volume and cost (e.g. record N% of sessions, or only sessions over some duration), or capture everything by default initially and tune later?
   Answer: our goal is only to use this for debug, so we should sample or limit.

5. Is there an existing PostHog account/org for AB Copenhagen already, or does provisioning create a brand new project?
   Answer:  Yes, there is an existing account setup.
