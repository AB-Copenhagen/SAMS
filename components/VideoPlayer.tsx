'use client';

import { useEffect, useRef, type CSSProperties, type DragEvent } from 'react';
import Hls from 'hls.js';

// Shared by staff asset detail, the review queue, and the public share view (gh-122), replacing
// three previously separate bare `<video controls>` usages. `src` is always the existing
// presigned/public fallback URL (today's behavior); `hlsSrc`, when present, is the HLS master
// manifest URL through one of the two streaming proxy routes
// (app/api/assets/[id]/hls/[...path], app/api/share/[token]/assets/[assetId]/hls/[...path]).
// Callers only pass `hlsSrc` once `hlsStatus === 'done'` — pre-ticket videos (no backfill) and
// videos still transcoding never get one, and fall back to `src` exactly like before this ticket.
export default function VideoPlayer({
  src,
  hlsSrc,
  poster,
  controls = true,
  autoPlay,
  draggable,
  onDragStart,
  onEnded,
  className,
  style,
}: {
  src: string;
  hlsSrc?: string | null;
  poster?: string;
  controls?: boolean;
  autoPlay?: boolean;
  draggable?: boolean;
  onDragStart?: (e: DragEvent<HTMLVideoElement>) => void;
  /** gh-128: playlist embed playback advances to the next item on this. */
  onEnded?: () => void;
  className?: string;
  style?: CSSProperties;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !hlsSrc) return; // no manifest yet — plain `src` attribute below already covers this

    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(hlsSrc);
      hls.attachMedia(video);
      return () => hls.destroy();
    }
    // `canPlayType` is checked only as a fallback, after Hls.isSupported() — it's an unreliable
    // signal on its own. It's meant to catch genuine native-HLS-only environments (older
    // iOS/Safari without MediaSource support), but some Chromium versions report "maybe" for
    // this MIME type despite having no real HLS demuxer, which fed a raw .m3u8 text manifest
    // into <video src> as if it were playable media — 0:00 duration, nothing decodes (confirmed
    // live on gh-122, Chrome 158).
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = hlsSrc;
      return;
    }
    // Neither — leave the `src` attribute (plain fallback) alone.
  }, [hlsSrc]);

  return (
    <video
      ref={videoRef}
      src={src}
      poster={poster}
      controls={controls}
      autoPlay={autoPlay}
      draggable={draggable}
      onDragStart={onDragStart}
      onEnded={onEnded}
      className={className}
      style={style}
    />
  );
}
