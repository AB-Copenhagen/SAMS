# Active Context: gh-120

## Open Learnings

(none — the pathname-only/Suspense-avoidance decision was written directly into techContext.md during implementation)

## Open Decisions

(none open)

## Session Notes

- Added manual `capturePageview()` wired to route changes via `PostHogProvider`'s new `pathname` prop; `autocapture` stays off. Phase 1 (only phase) complete.
