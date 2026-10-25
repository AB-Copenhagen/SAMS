# Active Context: gh-76

## Open Learnings

(none — durable learnings promoted to core files in `/dmx/create-pr`)

## Open Decisions

(none — all open questions were resolved in `spec.md`'s Q&A before `/dmx/plan`)

## Session Notes

- PR opened for: Replace Descope-role/domain login gate with an invite-based local user roster. All 5 phases implemented and committed.
- **Deployment-critical**: `POST /api/system/migrate-staff-users` must be run in production before this PR merges/deploys, or the login-gate cutover (Phase 3) locks everyone out immediately — nobody would have a `StaffUser` row yet.
- Manual verification checklist in `tasks.md` (seeded Admin login, never-invited-email rejection, PENDING→ACTIVE on first login, SUSPENDED cutoff within 24h) is unchecked, pending that production run.
