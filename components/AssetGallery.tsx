import type { ReactNode } from 'react';

export type GalleryAsset = {
  id: string;
  title: string | null;
  eventName: string | null;
  eventDate: Date | string | null;
  location: string | null;
  fileType: string;
  fileSize: number;
};

interface AssetGalleryProps {
  assets: GalleryAsset[];
  /** 'date' shows event date + location (media library style); 'filesize' shows type + size (collection style). */
  metaMode?: 'date' | 'filesize';
  /** Optional extra content rendered inside each card (e.g. a "needs review" badge). */
  renderExtra?: (asset: GalleryAsset) => ReactNode;
}

export default function AssetGallery({ assets, metaMode = 'date', renderExtra }: AssetGalleryProps) {
  return (
    <div className="gallery">
      {assets.map((a) => (
        <a key={a.id} href={`/media/${a.id}`} className="asset-card">
          <div className="asset-thumb">
            {a.fileType.startsWith('image/') ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/assets/${a.id}/download`} alt={a.title ?? ''} loading="lazy" />
            ) : '🎬'}
            {a.fileType.startsWith('video/') && <span className="video-badge">Video</span>}
          </div>
          <div className="asset-card-body">
            <div className="asset-card-title">{a.title || a.eventName || 'Untitled'}</div>
            <div className="asset-card-meta">
              {metaMode === 'filesize' ? (
                <>
                  {a.fileType.startsWith('image/') ? 'Photo' : 'Video'}
                  {a.fileSize ? ' · ' + (a.fileSize / 1024 / 1024).toFixed(1) + ' MB' : ''}
                </>
              ) : (
                <>
                  {a.eventDate
                    ? new Date(a.eventDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                    : ''}
                  {a.location ? (a.eventDate ? ' · ' : '') + a.location : ''}
                </>
              )}
            </div>
          </div>
          {renderExtra?.(a)}
        </a>
      ))}
    </div>
  );
}
