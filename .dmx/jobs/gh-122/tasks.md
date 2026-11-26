# Tasks: Add first-class video support: transcoding, adaptive playback, and a dedicated player

**Spec:** `.dmx/jobs/gh-122/spec.md`
**Branch:** feature-gh-122-add-first-class-video-support
**Ticket:** [gh-122](https://github.com/AB-Copenhagen/SAMS/issues/122)
**Status:** Merged (#124), but live verification found adaptive playback broken in Chrome — fix on `fix-gh-122-videoplayer-hls-detection-order`, pending re-verification

---

## Phase 1: Schema (self-hosted, no prisma migrations in this repo)

- [x] Add `hlsStatus` (`String @default("skipped")` — not `"pending"`; HLS has no backfill, see Open Learnings), `hlsAttempts` (`Int @default(0)`), `hlsKey` (`String?`) to the `Asset` model in `prisma/schema.prisma`, mirroring the existing `thumbnailStatus`/`thumbnailAttempts`/`thumbnailKey` fields
- [x] Add `app/api/system/add-hls-columns/route.ts`: one-shot admin POST route, idempotent `ALTER TABLE "Asset" ADD COLUMN ...` via `prisma.$executeRawUnsafe`, gated by `isAdmin(user)`, mirroring `app/api/system/add-scoreplay-import-fields/route.ts`
- [x] Note in the route's comment (and tell the developer) that it must be called once, post-deploy, from an authenticated admin session

## Phase 2: HLS transcoding (extends the existing video Sandbox job)

- [x] Create `lib/video-hls.ts`: `generateVideoHls(objectKey)`, reusing the `@vercel/sandbox` + `VIDEO_SANDBOX_SNAPSHOT_ID` pattern from `lib/video-thumbnail.ts` (`persistent: false`), running `ffmpeg` to produce an HLS rendition ladder + master playlist
- [x] Rendition ladder: 1080p/720p/480p candidates, `ffprobe`-gated to the source height (own ffprobe call, not shared with the thumbnail job — see Open Learnings on job concurrency); falls back to one rendition if the source is smaller than every rung. 6s segments, aligned GOPs (`-g 48 -keyint_min 48 -sc_threshold 0`) so ABR switches land on keyframes in every rendition.
- [x] Upload the master manifest + per-rendition playlists/segments to Wasabi under `hls/{objectKey}/v{n}/...` + `hls/{objectKey}/master.m3u8` (mirrors the `thumbnails/{objectKey}.jpg` key pattern), return the master manifest key as `hlsKey`
- [x] Sandbox timeout: new `SANDBOX_TIMEOUT_MS = 10min` in `lib/video-hls.ts`, separate from the 45s one in `lib/video-thumbnail.ts` (full transcode vs. a single poster-frame grab) — Phase 3's job route `maxDuration` must be at least this high

## Phase 3: Async job wiring (mirrors `tag-asset` / `generate-thumbnail`)

- [x] Add `processHls(assetId, db)` in `lib/tagging-pipeline.ts` that calls `generateVideoHls`, updates `hlsStatus`/`hlsKey` — no `fileType` branch needed since it's only ever enqueued for video assets
- [x] Add `app/api/jobs/transcode-video/route.ts`: QStash job route (`verifyQstashSignature`, re-throw on error for QStash retry), mirroring `app/api/jobs/generate-thumbnail/route.ts`. `maxDuration = 800` (matches the highest value already used in this project — the cron sync jobs — rather than a guessed new ceiling; covers `lib/video-hls.ts`'s 10min Sandbox timeout plus the Wasabi uploads after)
- [x] Enqueue `/api/jobs/transcode-video` at ingest completion (`app/api/ingest/sessions/[id]/complete`) alongside the existing thumbnail/tag jobs, video assets only; `hlsStatus` set explicitly to `'pending'`/`'skipped'` at `asset.create()` (the column default is `'skipped'`, see Phase 1)
- [x] Add an `hlsStatus: 'failed'` branch to `app/api/jobs/failed/route.ts`, mirroring the `thumbnailStatus`/`faceTagStatus` branches
- [x] Add a stale-`hlsStatus` reconciliation sweep to `app/api/cron/process-ingest-jobs/route.ts`, mirroring the existing `staleThumbRows` sweep, re-enqueueing to `/api/jobs/transcode-video`; added matching `CronRun.hlsStillPending`/`hlsSkipped` columns (folded into the Phase 1 admin migration route rather than a second one-shot route)

## Phase 4: Shared `<VideoPlayer>` component

- [x] **(added during implementation — see Open Learnings)** Added `app/api/assets/[id]/hls/[...path]/route.ts` (staff-auth) and `app/api/share/[token]/assets/[assetId]/hls/[...path]/route.ts` (share-token), mirroring the `original`/`download`/`preview` routes' auth checks. `.m3u8` paths are fetched server-side and returned as the body (new `lib/wasabi.ts` `fetchObjectText`, mirroring `fetchObjectJson`) so relative manifest references resolve against the proxy route itself; `.ts` segments are still 307-redirected to a presigned URL (cheaper, and they have no nested references to break). Path segments validated against a `[\w.-]+` allowlist (`lib/video-hls.ts`'s new `resolveHlsObjectKey`) to rule out traversal.
- [x] Added `hls.js` (not Vidstack — smaller, does exactly the one job needed: feed an HLS manifest to a plain `<video>` element) as a dependency
- [x] Created `components/VideoPlayer.tsx`: client component taking `src` (today's presigned/public fallback, always required) and optional `hlsSrc` (a manifest URL, built by the caller from `hlsStatus`); attaches `hls.js` on supporting browsers, sets `video.src` directly on Safari (native HLS, no MediaSource), otherwise leaves the plain `src` attribute alone — covers in-flight transcodes and the going-forward-only scope (pre-ticket videos never get an `hlsSrc`) with no special-casing needed at call sites beyond the `hlsStatus === 'done'` check
- [x] Replaced the bare `<video controls>` in `components/AssetDetailClient.tsx` with `<VideoPlayer>` (added `hlsKey`/`hlsStatus` to its `AssetProps` type and the `asset` object built in `app/media/[id]/page.tsx`)
- [x] Replaced the bare `<video controls>` in `components/ReviewWorkflowClient.tsx` with `<VideoPlayer>` (added `hlsStatus` to `RawQueueAsset`/`QueueItem` and to `app/api/assets/review-queue/route.ts`'s select/response; added `autoPlay`/`draggable`/`onDragStart` passthrough props to `VideoPlayer` for this call site's existing behavior)
- [x] Replaced the bare `<video controls>` in both public share surfaces — `components/PublicAssetGallery.tsx`'s lightbox and `app/s/[token]/[assetId]/page.tsx`'s single-asset page (two separate render sites, not one) — with `<VideoPlayer>`. Added `hlsStatus` to `GALLERY_LIST_SELECT`/`PublicAsset`/`sanitizePublicAsset` in `lib/collections.ts` and a `hlsUrl()` helper in `lib/public-asset-share.ts`

## Phase 5: Validation & Docs

- [x] Upload a real video, confirm `hlsStatus` progresses `pending` → `done`, and HLS manifest/segments land in Wasabi under the `hls/` prefix. Verified on production post-merge: `https://media.ab.dk/media/cmwwzw784000008jqcuwrbiuq` (`#122`'s sample video) — confirmed via `document.querySelector('video')?.currentSrc` in the browser, which returned `https://media.ab.dk/api/assets/cmwwzw784000008jqcuwrbiuq/hls/master.m3u8`, i.e. `hlsStatus` reached `'done'` and the proxy route is serving the real manifest.
- [ ] **Reopened.** Adaptive playback did NOT actually work despite the checks above looking green: `currentSrc` matched the manifest URL, but the video showed `0:00` and nothing played. Root cause (see `activeContext.md`): `VideoPlayer` checked `canPlayType('application/vnd.apple.mpegurl')` before `Hls.isSupported()`, and Chrome 158 returns `'maybe'` for that MIME type with no real HLS demuxer behind it — so the browser got a raw `.m3u8` text file as `<video src>` instead of `hls.js` attaching via MediaSource. Fixed on `fix-gh-122-videoplayer-hls-detection-order` (branched from `main` post-merge); re-verify against the same production asset once that fix ships.
- [x] Confirm pre-ticket videos (no `hlsKey`) still play via the presigned-URL fallback — no backfill in this ticket. Verified statically: traced `hlsStatus === 'done'` gating (and the `hlsSrc` fallback-to-`null`) at all four call sites, plus `VideoPlayer`'s effect, which only touches the `<video>` element when `hlsSrc` is truthy and otherwise leaves the plain `src` attribute (today's behavior) alone. The admin migration's `DEFAULT 'skipped'` means every pre-ticket row (image or video) reads `hlsStatus !== 'done'` once the column exists.
- [x] Confirm the public share view still serves HLS segments/manifests through the same signed-URL/token boundary as the original file — no new unauthenticated access path. Verified statically: `app/api/share/[token]/assets/[assetId]/hls/[...path]` calls the same `resolveShareTarget(token, assetId)` gate (404 / password-required / found) as the existing `download`/`preview` routes, and the path-segment allowlist in `resolveHlsObjectKey` rules out escaping the asset's own `hls/{objectKey}/` prefix.
- [x] Update `.dmx/techContext.md` with the new HLS pipeline, job route, and the one-shot admin schema endpoint

---
_Generated by /dmx/plan. Edit freely — this is your implementation contract._
