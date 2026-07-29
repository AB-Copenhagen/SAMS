'use client';

import { useState } from 'react';
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

export default function PublicAssetGallery({ token, assets }: Props) {
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const lightboxAsset = assets.find((a) => a.id === lightboxId) ?? null;

  return (
    <>
      <div className="gallery">
        {assets.map((a) => (
          <div key={a.id} className="asset-card" style={{ cursor: 'pointer' }} onClick={() => setLightboxId(a.id)}>
            <div className="asset-thumb">
              <Thumb token={token} asset={a} />
            </div>
            <div className="asset-card-body">
              <div className="asset-card-title">{a.title || a.eventName || 'Untitled'}</div>
              <div className="asset-card-meta">
                {a.fileType.startsWith('image/') ? 'Photo' : 'Video'}
                {a.fileSize ? ' · ' + (a.fileSize / 1024 / 1024).toFixed(1) + ' MB' : ''}
              </div>
            </div>
          </div>
        ))}
      </div>

      {lightboxAsset && (
        <div className="modal-backdrop" onClick={() => setLightboxId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 900 }}>
            <div className="modal-header">
              <h3>{lightboxAsset.title || lightboxAsset.eventName || 'Untitled'}</h3>
              <button className="modal-close" type="button" onClick={() => setLightboxId(null)}>×</button>
            </div>
            <div className="modal-body">
              {lightboxAsset.fileType.startsWith('image/') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/share/${token}/assets/${lightboxAsset.id}/download`}
                  alt={lightboxAsset.title ?? ''}
                  style={{ width: '100%', height: 'auto', borderRadius: 8 }}
                />
              ) : (
                <video
                  src={`/api/share/${token}/assets/${lightboxAsset.id}/download`}
                  controls
                  style={{ width: '100%', borderRadius: 8 }}
                />
              )}
              <div style={{ marginTop: 12, textAlign: 'right' }}>
                <a
                  className="btn-primary"
                  style={{ textDecoration: 'none', display: 'inline-block' }}
                  href={`/api/share/${token}/assets/${lightboxAsset.id}/download`}
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
