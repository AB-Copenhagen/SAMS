'use client';

import { useEffect, useState } from 'react';
import type { PublicAsset } from '../lib/collections';

interface Props {
  token: string;
  assets: PublicAsset[];
}

function Thumb({ token, asset }: { token: string; asset: PublicAsset }) {
  const isImage = asset.fileType.startsWith('image/');
  const isVideo = asset.fileType.startsWith('video/');
  const showThumbnail = isImage || (isVideo && asset.thumbnailKey && asset.thumbnailStatus === 'done');

  return showThumbnail ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/api/share/${token}/assets/${asset.id}/thumbnail`} alt={asset.title ?? ''} loading="lazy" />
  ) : (
    <span style={{ fontSize: 32 }}>🎬</span>
  );
}

function downloadUrl(token: string, assetId: string) {
  return `/api/share/${token}/assets/${assetId}/download`;
}

export default function PublicAssetGallery({ token, assets }: Props) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const lightboxAsset = lightboxIndex != null ? assets[lightboxIndex] : null;

  useEffect(() => {
    if (lightboxIndex == null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setLightboxIndex(null);
      if (e.key === 'ArrowRight') setLightboxIndex((i) => (i == null ? null : Math.min(i + 1, assets.length - 1)));
      if (e.key === 'ArrowLeft') setLightboxIndex((i) => (i == null ? null : Math.max(i - 1, 0)));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxIndex, assets.length]);

  return (
    <>
      <div className="gallery">
        {assets.map((a, i) => (
          <div key={a.id} className="asset-card" style={{ cursor: 'pointer' }} onClick={() => setLightboxIndex(i)}>
            <div className="asset-thumb">
              <Thumb token={token} asset={a} />
              <a
                href={downloadUrl(token, a.id)}
                onClick={(e) => e.stopPropagation()}
                title="Download"
                aria-label={`Download ${a.title || a.eventName || 'asset'}`}
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  background: 'rgba(13,15,28,0.7)',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textDecoration: 'none',
                  fontSize: 15,
                }}
              >
                ⬇
              </a>
            </div>
            <div className="asset-card-body">
              <div className="asset-card-title">{a.title || a.eventName || 'Untitled'}</div>
              <div className="asset-card-meta" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>
                  {a.fileType.startsWith('image/') ? 'Photo' : 'Video'}
                  {a.fileSize ? ' · ' + (a.fileSize / 1024 / 1024).toFixed(1) + ' MB' : ''}
                </span>
                <a
                  href={downloadUrl(token, a.id)}
                  onClick={(e) => e.stopPropagation()}
                  style={{ color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none' }}
                >
                  Download
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>

      {lightboxAsset && lightboxIndex != null && (
        <div className="modal-backdrop" onClick={() => setLightboxIndex(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 900 }}>
            <div className="modal-header">
              <h3>{lightboxAsset.title || lightboxAsset.eventName || 'Untitled'}</h3>
              <button className="modal-close" type="button" onClick={() => setLightboxIndex(null)}>×</button>
            </div>
            <div className="modal-body">
              {lightboxAsset.fileType.startsWith('image/') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={downloadUrl(token, lightboxAsset.id)}
                  alt={lightboxAsset.title ?? ''}
                  style={{ width: '100%', height: 'auto', borderRadius: 8, maxHeight: '70vh', objectFit: 'contain', background: '#0d0f1c' }}
                />
              ) : (
                <video
                  src={downloadUrl(token, lightboxAsset.id)}
                  controls
                  style={{ width: '100%', borderRadius: 8, maxHeight: '70vh' }}
                />
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn-secondary"
                    type="button"
                    disabled={lightboxIndex <= 0}
                    onClick={() => setLightboxIndex((i) => (i == null ? null : Math.max(i - 1, 0)))}
                  >
                    ← Prev
                  </button>
                  <button
                    className="btn-secondary"
                    type="button"
                    disabled={lightboxIndex >= assets.length - 1}
                    onClick={() => setLightboxIndex((i) => (i == null ? null : Math.min(i + 1, assets.length - 1)))}
                  >
                    Next →
                  </button>
                  <span style={{ alignSelf: 'center', fontSize: 12, color: '#8890b4' }}>
                    {lightboxIndex + 1} / {assets.length}
                  </span>
                </div>
                <a
                  className="btn-primary"
                  style={{ textDecoration: 'none', display: 'inline-block' }}
                  href={downloadUrl(token, lightboxAsset.id)}
                >
                  Download
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
