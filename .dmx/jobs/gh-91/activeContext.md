# Active Context: gh-91

## Open Learnings
- [repo-wide] The `migrate-goliath-last-active` one-shot admin route can't be run from this session — it doesn't exist in production until this branch deploys, and direct Turso/Prisma access from this environment is sandboxed (`scripts/push-turso.mjs` failed: `TURSO_DATABASE_URL` reads as empty here; direct Prisma reads are also blocked). Developer will call it from the browser console post-deploy, matching the existing `migrate-vivenu-fields`/etc. convention.

## Session Notes
- Implemented `goliathLastActiveAt` sync (via `GET /public/users/{id}`) and display on the customer detail page; `isAppUser`/`hasPushPermission` split to #93, Goliath analytics-event-stream idea stubbed as #92. All code phases complete; schema migration deferred to post-deploy.
- PR opened for: Sync and display Goliath app-engagement fields on customer detail page.
