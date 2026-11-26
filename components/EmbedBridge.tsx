'use client';

import { useEffect } from 'react';

// gh-123's postMessage handshake, embed-page side — the counterpart to /embed/player.js (Phase 6
// JS widget), which runs on the embedder's page. Renamed from EmbedResize (Phase 2, emit-only)
// now that it's bidirectional: still emits the resize handshake, and now also receives
// play/pause commands.
//
// `targetOrigin: '*'` on the outbound resize message is deliberate, not a shortcut — it carries
// only a height number (no asset content or token), and we don't reliably know the embedding
// page's origin from inside the iframe; the actual access control is the CSP `frame-ancestors`
// restriction on who may frame this page at all (Phase 3), not the postMessage targetOrigin.
//
// The inbound command listener doesn't check event.origin either, for the same reason plus one
// more: play/pause is not a sensitive action (it only controls playback of a video the visitor
// is already looking at) — there's nothing here worth gating behind an origin check that a
// privacy-restricted embedder page might fail anyway.
export default function EmbedBridge() {
  useEffect(() => {
    function postHeight() {
      window.parent.postMessage(
        { type: 'sams-embed-resize', height: document.documentElement.scrollHeight },
        '*',
      );
    }

    postHeight();
    const ro = new ResizeObserver(postHeight);
    ro.observe(document.body);
    window.addEventListener('load', postHeight);

    function onMessage(event: MessageEvent) {
      const data = event.data;
      if (!data || typeof data !== 'object' || data.type !== 'sams-embed-command') return;
      const video = document.querySelector('video');
      if (!video) return;
      if (data.command === 'play') void video.play();
      if (data.command === 'pause') video.pause();
    }
    window.addEventListener('message', onMessage);

    return () => {
      ro.disconnect();
      window.removeEventListener('load', postHeight);
      window.removeEventListener('message', onMessage);
    };
  }, []);

  return null;
}
