# Active Context: gh-122

## Open Learnings

(none open — promoted to `.dmx/techContext.md`'s Constraints section and the `@vercel/sandbox`/`hls.js` dependency lines: the no-backfill `hlsStatus` default, the concurrency-safe own-`ffprobe` design, and why manifests are proxied while segments are redirected)

## Open Decisions

(none open)

## Session Notes

- Phase 1 complete: `hlsKey`/`hlsStatus`/`hlsAttempts` added to `prisma/schema.prisma`, `app/api/system/add-hls-columns/route.ts` one-shot admin migration route added (not yet called against the live DB — do that once post-deploy). `prisma generate` + `tsc --noEmit` both clean.
- Phase 2 complete: `lib/video-hls.ts` added — `generateVideoHls(objectKey)` runs ffmpeg in the existing Sandbox snapshot, producing a 1080p/720p/480p HLS ladder (gated to source resolution) + master playlist, uploaded to Wasabi under `hls/{objectKey}/`. `tsc --noEmit` clean. Not yet wired to any job or DB write (Phase 3) and not yet servable to a player (Phase 4 — see the new proxy-route task above).
- Phase 3 complete: `processHls` (`lib/tagging-pipeline.ts`) + `/api/jobs/transcode-video` (QStash job, `maxDuration=800`) wired in; enqueued at ingest completion alongside `tag-asset`/`generate-thumbnail` for video assets only, with `hlsStatus` set explicitly at `asset.create()`. `/api/jobs/failed` and the `process-ingest-jobs` reconciliation sweep both extended to cover `hlsStatus`. Added `CronRun.hlsStillPending`/`hlsSkipped` to `prisma/schema.prisma` and folded into the still-uncalled `app/api/system/add-hls-columns` admin route rather than a second one-shot route. `tsc --noEmit` clean. The admin route must be called once, post-deploy, before any of this runs against the live DB.
- Phase 4 complete: two new HLS streaming proxy routes (staff + share-token), `hls.js` dependency, `components/VideoPlayer.tsx`, and all three (really four — the gallery lightbox and the single-asset share page are separate render sites) bare `<video>` usages replaced. `tsc --noEmit` clean across the whole project. `next build` could not fully complete in this sandbox — it got past TypeScript compilation and started per-route data collection, then failed on the pre-existing (unrelated to this ticket) `/api/assets/[id]/download` route with `TURSO_DATABASE_URL is not set`, since no live Turso credentials are configured here. No routing-conflict or type errors were surfaced for any of the new/changed routes before that point.
- Phase 5 complete, with two items left genuinely undone (not false-checked): the two "upload a real video / watch it transcode and play back adaptively" items need a live deploy with real `VIDEO_SANDBOX_SNAPSHOT_ID`/Wasabi/QStash credentials, none of which exist in this sandbox. Left unchecked in `tasks.md` rather than marked done, unlike gh-115's precedent of checking off unverified items on explicit developer instruction — no such instruction was given here.
- The other two validation items (no-backfill fallback behavior, share-view auth boundary) were verified by tracing the actual code paths end-to-end (not just "it typechecks") — these don't depend on a live service, so a static trace is genuine verification, not a stand-in for one.
- `.dmx/techContext.md` updated: `@vercel/sandbox` entry extended to mention `lib/video-hls.ts`; new `hls.js` dependency line; new Constraints entry covering the whole gh-122 pipeline (no-backfill default, concurrency-safe own-`ffprobe` design, why manifests are proxied vs. segments redirected, and that none of it is live-verified yet).
- Ticket not yet committed/PR'd — next steps would be `/dmx/commit` and/or `/dmx/create-pr`, and arranging the live-deploy verification for the two open Phase 5 items.
