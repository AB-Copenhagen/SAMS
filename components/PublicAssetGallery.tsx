'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { PublicAsset } from '../lib/collections';

interface Props {
  token: string;
  assets: PublicAsset[];
}

// Kept in sync with lib/export-presets.ts's EXPORT_PRESETS keys/labels — duplicated here (rather
// than imported) because that module pulls in `sharp`, which can't be bundled into client code.
const DOWNLOAD_PRESETS: { key: string; label: string }[] = [
  { key: 'web', label: 'Web' },
  { key: 'instagram-square', label: 'Instagram (square)' },
  { key: 'instagram-story', label: 'Instagram (story)' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'linkedin', label: 'LinkedIn' },
];

// Same "N★ & up" semantics as the admin MediaFilterBar, for a consistent mental model.
const RATING_OPTIONS = [
  { value: 0, label: 'Any rating' },
  { value: 4, label: '★★★★ only' },
  { value: 3, label: '★★★ & up' },
  { value: 2, label: '★★ & up' },
  { value: 1, label: '★ & up' },
];

function isImage(asset: PublicAsset) {
  return asset.fileType.startsWith('image/');
}

function originalUrl(token: string, assetId: string) {
  return `/api/share/${token}/assets/${assetId}/download`;
}

function exportUrl(token: string, assetId: string, preset: string) {
  return `/api/share/${token}/assets/${assetId}/export?preset=${preset}`;
}

/** Fast default for quick-tap downloads — web-optimized for photos, original for video (no resize pipeline). */
function quickDownloadUrl(token: string, asset: PublicAsset) {
  return isImage(asset) ? exportUrl(token, asset.id, 'web') : originalUrl(token, asset.id);
}

function sortTimestamp(asset: PublicAsset): number {
  const raw = asset.dateTaken ?? asset.eventDate ?? asset.uploadedAt;
  return new Date(raw).getTime();
}

function displayDate(asset: PublicAsset): { label: string; value: string } {
  if (asset.dateTaken) return { label: 'Taken', value: new Date(asset.dateTaken).toLocaleString('en-GB') };
  if (asset.eventDate) return { label: 'Event date', value: new Date(asset.eventDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) };
  return { label: 'Uploaded', value: new Date(asset.uploadedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) };
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

function AssetDetails({ asset }: { asset: PublicAsset }) {
  const date = displayDate(asset);
  const hasTags = asset.tags.players.length > 0 || asset.tags.sponsors.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#3b4070' }}>
      {asset.description && <p style={{ margin: 0, color: '#3b4070' }}>{asset.description}</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', color: '#6b7491' }}>
        <span><strong style={{ color: '#3b4070' }}>{date.label}:</strong> {date.value}</span>
        {asset.location && <span><strong style={{ color: '#3b4070' }}>Location:</strong> {asset.location}</span>}
        {asset.rating != null && <span><strong style={{ color: '#3b4070' }}>Rating:</strong> {'★'.repeat(asset.rating)}</span>}
      </div>
      {hasTags && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
          {asset.tags.players.map((p) => (
            <span key={p.id} className="tag-chip">{p.name}{p.number != null ? ` #${p.number}` : ''}</span>
          ))}
          {asset.tags.sponsors.map((s) => (
            <span key={s.id} className="tag-chip">{s.name}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function DownloadOptions({ token, asset }: { token: string; asset: PublicAsset }) {
  if (!isImage(asset)) {
    return (
      <a className="btn-primary" style={{ textDecoration: 'none', display: 'inline-block' }} href={originalUrl(token, asset.id)}>
        Download
      </a>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 11, color: '#8890b4' }}>Download as</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {DOWNLOAD_PRESETS.map((p) => (
          <a key={p.key} className="btn-secondary" style={{ textDecoration: 'none', fontSize: 12, padding: '5px 10px' }} href={exportUrl(token, asset.id, p.key)}>
            {p.label}
          </a>
        ))}
        <a className="btn-primary" style={{ textDecoration: 'none', fontSize: 12, padding: '5px 10px' }} href={originalUrl(token, asset.id)}>
          Original (full size)
        </a>
      </div>
    </div>
  );
}

/** Builds a permalink back to this exact asset within the shared gallery (?asset=<id>). */
function assetPermalink(assetId: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set('asset', assetId);
  return url.toString();
}

function ShareAction({ asset }: { asset: PublicAsset }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = assetPermalink(asset.id);
    const shareData = { title: asset.title || 'Photo', url };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch { /* user cancelled — not an error */ }
      return;
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 11, color: '#8890b4' }}>Share this</span>
      <button className="btn-secondary" type="button" onClick={share} style={{ alignSelf: 'flex-start' }}>
        {copied ? 'Link copied!' : '📤 Share this photo'}
      </button>
    </div>
  );
}

export default function PublicAssetGallery({ token, assets }: Props) {
  const [ratingFilter, setRatingFilter] = useState(0);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const hasAnyRating = assets.some((a) => a.rating != null);

  const visibleAssets = useMemo(() => {
    const filtered = ratingFilter > 0 ? assets.filter((a) => (a.rating ?? 0) >= ratingFilter) : assets;
    const sorted = [...filtered].sort((a, b) =>
      sortOrder === 'newest' ? sortTimestamp(b) - sortTimestamp(a) : sortTimestamp(a) - sortTimestamp(b));
    return sorted;
  }, [assets, ratingFilter, sortOrder]);

  // Filters/sorting can change which assets exist at a given index — close the lightbox rather
  // than risk it pointing at a different asset than the one the visitor opened.
  useEffect(() => { setLightboxIndex(null); }, [ratingFilter, sortOrder]);

  const lightboxAsset = lightboxIndex != null ? visibleAssets[lightboxIndex] : null;

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
        {hasAnyRating && (
          <select value={ratingFilter} onChange={(e) => setRatingFilter(Number(e.target.value))}>
            {RATING_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        )}
        <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest')}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
        <span style={{ fontSize: 12, color: '#8890b4' }}>
          {visibleAssets.length} of {assets.length} item{assets.length !== 1 ? 's' : ''}
        </span>
      </div>

      {visibleAssets.length === 0 ? (
        <div className="empty-state card">
          <h3>No matching items</h3>
          <p>Try a different rating filter.</p>
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
                  // Web-optimized preview, not the full original — much faster on mobile. Full
                  // size is one tap away via the download options in the side column.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={exportUrl(token, lightboxAsset.id, 'web')}
                    alt={lightboxAsset.title ?? ''}
                    style={{ width: '100%', height: 'auto', borderRadius: 8, maxHeight: '65vh', objectFit: 'contain', background: '#0d0f1c' }}
                  />
                ) : (
                  <video
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
                <ShareAction asset={lightboxAsset} />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
