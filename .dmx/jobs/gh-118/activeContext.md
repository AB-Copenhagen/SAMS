# Active Context: gh-118

## Open Learnings

(none open — folded into the existing unverified-PostHog-delivery caveat in techContext.md)

## Open Decisions

(none open)

## Session Notes

- Implemented explicit `startSessionRecording()` (project default now off) and `captureException`/`captureServerException` for client + the 5 cron routes, with shared best-effort redaction. All 3 phases complete except the live-dashboard verification task.
- PR opened for: Explicitly enable PostHog session recording and add error tracking
