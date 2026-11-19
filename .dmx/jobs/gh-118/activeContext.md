# Active Context: gh-118

## Open Learnings

(none open — the redaction-vs-cuid caveat was promoted directly into techContext.md's PostHog row)

## Open Decisions

- [repo-wide] The last Phase 3 task (confirming in the live PostHog dashboard that a real client/server exception actually shows up, redacted as expected) is still unchecked in `tasks.md` — needs a post-deploy manual check.

## Session Notes

- Implemented explicit `startSessionRecording()` (project default now off) and `captureException`/`captureServerException` for client + the 5 cron routes, with shared best-effort redaction. All 3 phases complete except the live-dashboard verification task.
