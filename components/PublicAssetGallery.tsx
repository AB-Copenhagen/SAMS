'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import type { PublicAsset } from '../lib/collections';
import { SaveShareMenu, isImage, originalUrl, previewUrl, quickDownloadUrl } from './PublicAssetView';

interface Props {
  token: string;
  assets: PublicAsset[];
}

const SWIPE_THRESHOLD_PX = 120;
const EXIT_DURATION_MS = 260;

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

  // Drag-and-fling state for the lightbox's swipe-to-browse gesture.
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [exiting, setExiting] = useState<'left' | 'right' | null>(null);
  const dragStartX = useRef<number | null>(null);

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
  // instead of silently sitting on stale content. Also resets drag state so a new photo always
  // starts centered, regardless of how the previous one was left.
  useEffect(() => {
    setLightboxImgLoaded(false);
    setDragX(0);
    setDragging(false);
    setExiting(null);
  }, [lightboxAsset?.id]);

  // Warm the browser cache for the next/prev preview while the current one is being viewed — on
  // an asset that's never been previewed before, /preview still self-heals a fresh render on
  // first request, so this gives that resize a head start before the visitor swipes.
  useEffect(() => {
    if (lightboxIndex == null) return;
    for (const i of [lightboxIndex - 1, lightboxIndex + 1]) {
      const neighbor = visibleAssets[i];
      if (!neighbor || !isImage(neighbor)) continue;
      const img = new window.Image();
      img.src = previewUrl(token, neighbor.id);
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

  // Once a swipe clears the threshold, animate the photo the rest of the way off-screen, then
  // swap to the next/prev asset — the new photo mounts already centered (dragX resets in the
  // asset-id effect above), so there's no visible snap-back of the old transform.
  useEffect(() => {
    if (!exiting) return;
    const distance = (typeof window !== 'undefined' ? window.innerWidth : 800) * 1.1;
    setDragX(exiting === 'left' ? -distance : distance);
    const t = setTimeout(() => {
      setLightboxIndex((i) => {
        if (i == null) return null;
        return exiting === 'left' ? Math.min(i + 1, visibleAssets.length - 1) : Math.max(i - 1, 0);
      });
    }, EXIT_DURATION_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exiting]);

  function onDragPointerDown(e: ReactPointerEvent) {
    if (exiting) return;
    dragStartX.current = e.clientX;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onDragPointerMove(e: ReactPointerEvent) {
    if (dragStartX.current == null) return;
    setDragX(e.clientX - dragStartX.current);
  }

  function onDragPointerUp() {
    if (dragStartX.current == null) return;
    dragStartX.current = null;
    setDragging(false);

    const canGoNext = lightboxIndex != null && lightboxIndex < visibleAssets.length - 1;
    const canGoPrev = lightboxIndex != null && lightboxIndex > 0;

    if (dragX <= -SWIPE_THRESHOLD_PX && canGoNext) setExiting('left');
    else if (dragX >= SWIPE_THRESHOLD_PX && canGoPrev) setExiting('right');
    else setDragX(0);
  }

  const dragStyle: CSSProperties = {
    position: 'relative',
    width: '100%',
    height: '100%',
    transform: `translateX(${dragX}px) rotate(${dragX / 20}deg)`,
    opacity: exiting ? 0 : 1,
    transition: dragging ? 'none' : 'transform 0.25s ease, opacity 0.25s ease',
    touchAction: 'none',
  };

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
                    top: 6,
                    right: 6,
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    background: 'rgba(13,15,28,0.7)',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textDecoration: 'none',
                    fontSize: 17,
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
        <div className="lightbox-backdrop" onClick={() => setLightboxIndex(null)}>
          <div className="lightbox-stage" onClick={(e) => e.stopPropagation()}>
            <button className="lightbox-close" type="button" onClick={() => setLightboxIndex(null)} aria-label="Close">×</button>
            <SaveShareMenu token={token} asset={lightboxAsset} />

            <div
              style={dragStyle}
              onPointerDown={onDragPointerDown}
              onPointerMove={onDragPointerMove}
              onPointerUp={onDragPointerUp}
              onPointerCancel={onDragPointerUp}
            >
              {isImage(lightboxAsset) ? (
                <>
                  {/* Instant blur-up placeholder: the same thumbnail the grid card just showed,
                      almost certainly already sitting in the browser's cache, fills the stage
                      immediately while the sharp 1920px preview loads on top. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/share/${token}/assets/${lightboxAsset.id}/thumbnail`}
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                    onDragStart={(e) => e.preventDefault()}
                    style={{
                      position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain',
                      filter: 'blur(8px)', transform: 'scale(1.03)',
                    }}
                  />
                  {/* Web-optimized preview, not the full original — much faster on mobile. Full
                      size is one tap away via the Save & Share menu. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    key={lightboxAsset.id}
                    src={previewUrl(token, lightboxAsset.id)}
                    alt={lightboxAsset.title ?? ''}
                    draggable={false}
                    onDragStart={(e) => e.preventDefault()}
                    onLoad={() => setLightboxImgLoaded(true)}
                    style={{
                      position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain',
                      opacity: lightboxImgLoaded ? 1 : 0, transition: 'opacity 0.2s ease-in',
                    }}
                  />
                  {!lightboxImgLoaded && (
                    <span
                      style={{
                        position: 'absolute', bottom: 10, right: 10, display: 'flex', alignItems: 'center', gap: 6,
                        fontSize: 11, fontWeight: 600, color: 'white', background: 'rgba(255,255,255,0.12)',
                        padding: '4px 9px', borderRadius: 20, pointerEvents: 'none',
                      }}
                    >
                      <span className="spinner" style={{ width: 11, height: 11 }} /> Loading full quality…
                    </span>
                  )}
                </>
              ) : (
                <video
                  key={lightboxAsset.id}
                  src={originalUrl(token, lightboxAsset.id)}
                  controls
                  draggable={false}
                  onDragStart={(e) => e.preventDefault()}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
                />
              )}
            </div>

            <span className="lightbox-counter">{lightboxIndex + 1} / {visibleAssets.length}</span>
          </div>
        </div>
      )}
    </>
  );
}
