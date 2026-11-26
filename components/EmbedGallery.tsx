'use client';

import { useState } from 'react';
import type { PublicAsset } from '../lib/collections';
import VideoPlayer from './VideoPlayer';

interface Props {
  token: string;
  assets: (PublicAsset & { thumbnailUrl?: string })[];
}

// Deliberately not a reuse of components/PublicAssetGallery.tsx (gh-123): that component always
// renders SaveShareMenu's download/share-to-social affordances per asset, appropriate for a
// visitor who navigated to a full `/s/[token]` page, but out of place inside a 3rd-party page's
// embedded iframe — an embed is presentation-only, no "download this" UI. This is a deliberately
// smaller component: a grid + a simple expand-in-place view, nothing else.
export default function EmbedGallery({ token, assets }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const open = openIndex != null ? assets[openIndex] : null;

  return (
    <div style={{ padding: 8 }}>
      {!open && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 6,
          }}
        >
          {assets.map((asset, i) => {
            const isVideo = asset.fileType.startsWith('video/');
            return (
              <button
                key={asset.id}
                onClick={() => setOpenIndex(i)}
                style={{
                  position: 'relative', aspectRatio: '1', border: 'none', padding: 0, cursor: 'pointer',
                  background: '#0d0f1c', borderRadius: 4, overflow: 'hidden',
                }}
              >
                {asset.thumbnailUrl || (asset.thumbnailStatus === 'done' && asset.thumbnailKey) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={asset.thumbnailUrl ?? `/api/embed/${token}/assets/${asset.id}/thumbnail`}
                    alt={asset.title ?? ''}
                    loading="lazy"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>
                    {isVideo ? '🎬' : '🖼️'}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {open && (
        <div>
          <button
            onClick={() => setOpenIndex(null)}
            style={{ marginBottom: 8, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}
          >
            ← Back to gallery
          </button>
          <div style={{ position: 'relative', width: '100%', background: '#0d0f1c' }}>
            {open.fileType.startsWith('video/') ? (
              <VideoPlayer
                src={`/api/embed/${token}/assets/${open.id}/download`}
                hlsSrc={open.hlsStatus === 'done' ? `/api/embed/${token}/assets/${open.id}/hls/master.m3u8` : null}
                controls
                style={{ width: '100%', display: 'block', maxHeight: 640 }}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/embed/${token}/assets/${open.id}/preview`}
                alt={open.title ?? ''}
                style={{ width: '100%', display: 'block', maxHeight: 640, objectFit: 'contain' }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
