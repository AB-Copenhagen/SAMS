'use client';

import { useState } from 'react';
import VideoPlayer from './VideoPlayer';
import EmbedBridge from './EmbedBridge';

type PlaylistEmbedItem = { id: string; hlsStatus: string };

// gh-128: the playlist-target render branch of /embed/[token] — one <video> at a time, not a
// playback queue baked into <video> itself (browsers don't support that), auto-advancing via
// VideoPlayer's onEnded. autoPlay only kicks in once the viewer has already started playback
// once (the very first item still requires a click, same as a single-asset embed today) — by
// then the page already has the user-activation most browsers require to allow programmatic
// play() on the next <video> element without it being silently blocked.
export default function EmbedPlaylistPlayer({ token, items }: { token: string; items: PlaylistEmbedItem[] }) {
  const [index, setIndex] = useState(0);
  const [autoAdvance, setAutoAdvance] = useState(false);

  const item = items[index];
  const isLast = index === items.length - 1;

  function handleEnded() {
    if (isLast) return;
    setAutoAdvance(true);
    setIndex((i) => i + 1);
  }

  return (
    <div style={{ margin: 0, background: '#0d0f1c' }}>
      <EmbedBridge />
      <VideoPlayer
        key={item.id}
        src={`/api/embed/${token}/assets/${item.id}/download`}
        hlsSrc={item.hlsStatus === 'done' ? `/api/embed/${token}/assets/${item.id}/hls/master.m3u8` : null}
        controls
        autoPlay={autoAdvance}
        onEnded={handleEnded}
        style={{ width: '100%', display: 'block' }}
      />
    </div>
  );
}
