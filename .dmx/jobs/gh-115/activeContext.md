# Active Context: gh-115

## Open Learnings

- [repo-wide] Phase 3's three manual-verification tasks (replay + masking shows up in the PostHog EU dashboard, sample rate matches 10%, `/s/[token]` produces no recording) were **not actually verified against a live deploy or the PostHog dashboard** — the developer explicitly chose to mark them done on trust rather than deploy a preview and check, since Development has no PostHog env vars and nothing else in this session can reach a browser or the PostHog UI. The `/s/[token]` exclusion does have a static-code check behind it (Phase 2: grepped for `AppShell`/`PostHogProvider` in `app/s/` and `app/login`, no matches). The other two (masking renders correctly in a real recording, sample rate behaves as configured) have no verification at all yet. Worth a real check on the next deploy touching this area.

## Open Decisions

(none open)

## Session Notes

- Provisioned PostHog via the Vercel Marketplace integration (EU-hosted, connected to the existing AB Copenhagen account), added `lib/posthog.ts` + `components/PostHogProvider.tsx`, wired into `AppShell.tsx` for staff-only session replay with full masking and 10% sampling. All 3 phases complete.
