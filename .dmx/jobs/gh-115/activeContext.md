# Active Context: gh-115

## Open Learnings

(none open — promoted to techContext.md)

## Open Decisions

(none open)

## Session Notes

- Provisioned PostHog via the Vercel Marketplace integration (EU-hosted, connected to the existing AB Copenhagen account), added `lib/posthog.ts` + `components/PostHogProvider.tsx`, wired into `AppShell.tsx` for staff-only session replay with full masking and 10% sampling. All 3 phases complete.
- PR opened for: Add PostHog session replay for the staff app
