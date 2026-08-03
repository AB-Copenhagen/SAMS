'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { PublicAsset } from '../lib/collections';
import { AssetDetails, DownloadOptions, ShareAction, exportUrl, isImage, originalUrl, quickDownloadUrl } from './PublicAssetView';

interface Props {
  token: string;
  assets: PublicAsset[];
}

function sortTimestamp(asset: PublicAsset): number {
  const raw = asset.dateTaken ?? asset.eventDate ?? asset.uploadedAt;
  return new Date(raw).getTime();
}

function Thumb({ token, asset }: { token: string; asset: PublicAsset }) {
  const isVideo = asset.fileType.startsWith('video/');
  const showThumbnail = isImage(asset) || (isVideo && asset.thumbnailKey && asset.thumbnailStatus === 'done');

  return showThumbnail ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/api/share/${token}/assets/${asset.id}/thumbnail`} alt={asset.title ?? ''} loading="lazy" />
  ) : (
    <span style={{ fontSize: 32 }}>🎬</span>
  );
}

export default function PublicAssetGallery({ token, assets }: Props) {
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [lightboxImgLoaded, setLightboxImgLoaded] = useState(false);

  const visibleAssets = useMemo(() => {
    return [...assets].sort((a, b) =>
      sortOrder === 'newest' ? sortTimestamp(b) - sortTimestamp(a) : sortTimestamp(a) - sortTimestamp(b));
  }, [assets, sortOrder]);

  // Sorting can change which assets exist at a given index — close the lightbox rather than risk
  // it pointing at a different asset than the one the visitor opened.
  useEffect(() => { setLightboxIndex(null); }, [sortOrder]);

  const lightboxAsset = lightboxIndex != null ? visibleAssets[lightboxIndex] : null;

  // Advancing swaps `src` on the same <img> element — the browser keeps showing the previous
  // frame until the new one finishes loading, which reads as "nothing happened" on a slow
  // connection. Tracking load state per-asset lets the image dim out immediately on advance
  // instead of silently sitting on stale content.
  useEffect(() => { setLightboxImgLoaded(false); }, [lightboxAsset?.id]);

  // Warm the browser cache for the next/prev preview while the current one is being viewed, so
  // the (uncached, live-resized) /export request has already had time to complete by the time the
  // visitor actually taps Next/Prev — the biggest single factor in the lightbox feeling slow.
  useEffect(() => {
    if (lightboxIndex == null) return;
    for (const i of [lightboxIndex - 1, lightboxIndex + 1]) {
      const neighbor = visibleAssets[i];
      if (!neighbor || !isImage(neighbor)) continue;
      const img = new window.Image();
      img.src = exportUrl(token, neighbor.id, 'web');
    }
  }, [lightboxIndex, visibleAssets, token]);

  // Deep-link support: opening a photo (or navigating prev/next) updates ?asset=<id> so the
  // "Share this photo" link reopens straight to it, and a matching id in the URL on first load
  // (e.g. from a shared link) auto-opens that photo.
  const didInitFromUrl = useRef(false);
  useEffect(() => {
    if (didInitFromUrl.current) return;
    didInitFromUrl.current = true;
    const assetId = new URLSearchParams(window.location.search).get('asset');
    if (!assetId) return;
    const idx = visibleAssets.findIndex((a) => a.id === assetId);
    if (idx !== -1) setLightboxIndex(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (lightboxAsset) url.searchParams.set('asset', lightboxAsset.id);
    else url.searchParams.delete('asset');
    window.history.replaceState(null, '', url.toString());
  }, [lightboxAsset]);

  useEffect(() => {
    if (lightboxIndex == null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setLightboxIndex(null);
      if (e.key === 'ArrowRight') setLightboxIndex((i) => (i == null ? null : Math.min(i + 1, visibleAssets.length - 1)));
      if (e.key === 'ArrowLeft') setLightboxIndex((i) => (i == null ? null : Math.max(i - 1, 0)));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxIndex, visibleAssets.length]);

  return (
    <>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest')}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
        <span style={{ fontSize: 12, color: '#8890b4' }}>
          {visibleAssets.length} item{visibleAssets.length !== 1 ? 's' : ''}
        </span>
      </div>

      {visibleAssets.length === 0 ? (
        <div className="empty-state card">
          <h3>Nothing here yet</h3>
          <p>Check back later.</p>
        </div>
      ) : (
        <div className="gallery">
          {visibleAssets.map((a, i) => (
            <div key={a.id} className="asset-card" style={{ cursor: 'pointer' }} onClick={() => setLightboxIndex(i)}>
              <div className="asset-thumb">
                <Thumb token={token} asset={a} />
                <a
                  href={quickDownloadUrl(token, a)}
                  onClick={(e) => e.stopPropagation()}
                  title="Download (web-optimized)"
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
                {a.rating != null && (
                  <span
                    style={{
                      position: 'absolute',
                      bottom: 6,
                      left: 6,
                      background: 'rgba(0,0,0,0.65)',
                      color: '#ffd54a',
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: 4,
                    }}
                  >
                    {'★'.repeat(a.rating)}
                  </span>
                )}
              </div>
              <div className="asset-card-body">
                <div className="asset-card-title">{a.title || a.eventName || 'Untitled'}</div>
                {/* Only a separate line when eventName isn't already standing in as the title above. */}
                {a.title && a.eventName && (
                  <div className="asset-card-meta" style={{ color: '#6b7491', marginTop: -2 }}>{a.eventName}</div>
                )}
                <div className="asset-card-meta" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>
                    {a.fileType.startsWith('image/') ? 'Photo' : 'Video'}
                    {a.fileSize ? ' · ' + (a.fileSize / 1024 / 1024).toFixed(1) + ' MB' : ''}
                  </span>
                  <a
                    href={quickDownloadUrl(token, a)}
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
      )}

      {lightboxAsset && lightboxIndex != null && (
        <div className="modal-backdrop" onClick={() => setLightboxIndex(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 1100 }}>
            <div className="modal-header">
              <h3>{lightboxAsset.title || lightboxAsset.eventName || 'Untitled'}</h3>
              <button className="modal-close" type="button" onClick={() => setLightboxIndex(null)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ flex: '1 1 440px', minWidth: 260 }}>
                {isImage(lightboxAsset) ? (
                  <div style={{ position: 'relative' }}>
                    {/* Web-optimized preview, not the full original — much faster on mobile. Full
                        size is one tap away via the download options in the side column. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      key={lightboxAsset.id}
                      src={exportUrl(token, lightboxAsset.id, 'web')}
                      alt={lightboxAsset.title ?? ''}
                      onLoad={() => setLightboxImgLoaded(true)}
                      style={{
                        width: '100%', height: 'auto', borderRadius: 8, maxHeight: '65vh', objectFit: 'contain',
                        background: '#0d0f1c', opacity: lightboxImgLoaded ? 1 : 0.35, transition: 'opacity 0.15s ease-in',
                      }}
                    />
                    {!lightboxImgLoaded && (
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span className="spinner" />
                      </div>
                    )}
                  </div>
                ) : (
                  <video
                    key={lightboxAsset.id}
                    src={originalUrl(token, lightboxAsset.id)}
                    controls
                    style={{ width: '100%', borderRadius: 8, maxHeight: '65vh' }}
                  />
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
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
                    disabled={lightboxIndex >= visibleAssets.length - 1}
                    onClick={() => setLightboxIndex((i) => (i == null ? null : Math.min(i + 1, visibleAssets.length - 1)))}
                  >
                    Next →
                  </button>
                  <span style={{ fontSize: 12, color: '#8890b4' }}>
                    {lightboxIndex + 1} / {visibleAssets.length}
                  </span>
                </div>
              </div>

              <div style={{ flex: '0 1 260px', minWidth: 220, display: 'flex', flexDirection: 'column', gap: 18 }}>
                <AssetDetails asset={lightboxAsset} />
                <DownloadOptions token={token} asset={lightboxAsset} />
                <ShareAction token={token} asset={lightboxAsset} />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
