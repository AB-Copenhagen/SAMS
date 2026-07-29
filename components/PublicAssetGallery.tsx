'use client';

import { useEffect, useState } from 'react';
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#3b4070', marginTop: 12 }}>
      {asset.description && <p style={{ margin: 0, color: '#3b4070' }}>{asset.description}</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', color: '#6b7491' }}>
        <span><strong style={{ color: '#3b4070' }}>{date.label}:</strong> {date.value}</span>
        {asset.location && <span><strong style={{ color: '#3b4070' }}>Location:</strong> {asset.location}</span>}
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
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
      <span style={{ fontSize: 11, color: '#8890b4' }}>Download as</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
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

      {lightboxAsset && lightboxIndex != null && (
        <div className="modal-backdrop" onClick={() => setLightboxIndex(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 900 }}>
            <div className="modal-header">
              <h3>{lightboxAsset.title || lightboxAsset.eventName || 'Untitled'}</h3>
              <button className="modal-close" type="button" onClick={() => setLightboxIndex(null)}>×</button>
            </div>
            <div className="modal-body">
              {isImage(lightboxAsset) ? (
                // Web-optimized preview, not the full original — much faster on mobile. Full size
                // is one tap away via the download options below.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={exportUrl(token, lightboxAsset.id, 'web')}
                  alt={lightboxAsset.title ?? ''}
                  style={{ width: '100%', height: 'auto', borderRadius: 8, maxHeight: '70vh', objectFit: 'contain', background: '#0d0f1c' }}
                />
              ) : (
                <video
                  src={originalUrl(token, lightboxAsset.id)}
                  controls
                  style={{ width: '100%', borderRadius: 8, maxHeight: '70vh' }}
                />
              )}

              <AssetDetails asset={lightboxAsset} />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 14, flexWrap: 'wrap', gap: 12 }}>
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
                <DownloadOptions token={token} asset={lightboxAsset} />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
