---
ticket: gh-122
branch: feature-gh-122-add-first-class-video-support
summary: Add first-class video support — transcoding, adaptive playback, and a dedicated player
ticketing: github-issues
components: []
---

# Add first-class video support: transcoding, adaptive playback, and a dedicated player

**Ticket:** [#122](https://github.com/AB-Copenhagen/SAMS/issues/122)
**Type:** feature
**Branch:** feature-gh-122-add-first-class-video-support

---

## Context

Current video handling is minimal: the original file is stored as-is in Wasabi, and a single JPEG poster frame is generated via ffmpeg in a Vercel Sandbox (`lib/video-thumbnail.ts`), alongside `videoWidth`/`videoHeight`/`durationMs` metadata from ffprobe. All playback — staff asset detail (`components/AssetDetailClient.tsx`), the review queue (`components/ReviewWorkflowClient.tsx`), and the public share view (`app/s/[token]/[assetId]/page.tsx`, `components/PublicAssetGallery.tsx`) — is a bare `<video controls>` pointed at a presigned Wasabi URL. There is no transcoding, no adaptive bitrate streaming (HLS/DASH), no captions/subtitles, no scrubbing thumbnails, and no player analytics (watch time, rebuffering, drop-off). Three separate ad hoc `<video>` usages exist with no shared player component.

## Scope (draft — refine via /dmx/plan)

- Decide on a video pipeline: managed platform (Mux Video, Cloudflare Stream, or Bunny Stream) vs. self-hosted transcoding (ffmpeg HLS packaging extending the existing Vercel Sandbox job).
- Add adaptive bitrate playback (HLS/DASH) via a real player (e.g. Mux Player, hls.js, Vidstack), replacing the bare `<video>` tag.
- Add one shared `<VideoPlayer>` component used across asset detail, review queue, and public share views, superseding the three current ad hoc implementations.
- Add player-side analytics (watch time, rebuffering, drop-off) if the chosen platform provides it.

## Out of Scope

- Embedding video/galleries in 3rd-party sites (ab.dk, other apps) — tracked separately.
- Any change to the ingest pipeline or AI tagging (face/jersey/sponsor detection).

## Technical Approach (draft)

- `lib/video-thumbnail.ts` (ffmpeg/ffprobe in a `@vercel/sandbox`, `persistent: false`) generates today's poster frame + metadata. This is not a natural base for full ABR transcoding — a single frame grab and a full rendition ladder are different orders of workload — so it's likely superseded for playback purposes (possibly kept for metadata/poster generation) rather than incrementally extended, depending on the chosen platform.
- Wasabi stays the source of truth for originals either way, mirroring the existing non-destructive `editedKey` pattern already used for photos — the video platform becomes a derived-asset layer, not a storage replacement.
- Candidate platforms (from research):
  - **Mux (Video + Player)** — accepts pull-by-URL ingestion, so it can encode directly from a presigned Wasabi URL without re-platforming storage. Ships `@mux/mux-player-react` with documented Next.js SSR guidance, and bundles Mux Data analytics (watch time, rebuffering, drop-off) with no extra wiring. Cost roughly $0.0024/min storage + $0.0008/min delivery.
  - **Cloudflare Stream** — flat per-minute pricing (storage + delivery) independent of resolution; own hosted player + iframe embed; signed URLs plus separate domain-level Hotlink Protection.
  - **Bunny Stream** — cheapest at volume, but thinner analytics/player tooling.
  - **Self-hosted** — ffmpeg HLS packaging + hls.js/Vidstack as the player; most control, most ongoing maintenance (rendition ladders, sprite sheets, and analytics all DIY).
  - AWS MediaConvert + CloudFront was considered and set aside — no reason to be AWS-native given the current Vercel/Wasabi stack.

---

## Questions

<!-- Answer each question before running /dmx/plan. -->

1. Which pipeline do we commit to — Mux, Cloudflare Stream, or self-hosted? Self-hosted (ffmpeg HLS packaging extending the existing Vercel Sandbox job + hls.js/Vidstack player).
2. Do we need captions/subtitles in scope now, or is ABR + a real player the actual bar for "first-class" at this stage?  Captions are not needed.
3. Any existing budget ceiling for video storage/delivery cost that should weight the platform choice? As long as we're storing in Wasabi, we have no budget issues.
4. Should this re-process the existing video library (backfill), or only apply going forward to new uploads?  Going for new videos only.  We can address older videos later.
