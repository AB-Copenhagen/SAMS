'use client';

import type { MouseEvent, ReactNode } from 'react';
import AssetThumbnail from './AssetThumbnail';

export type GalleryAsset = {
  id: string;
  title: string | null;
  eventName: string | null;
  eventDate: Date | string | null;
  location: string | null;
  fileType: string;
  fileSize: number;
  thumbnailKey: string | null;
  thumbnailStatus: string;
};

interface AssetGalleryProps {
  assets: GalleryAsset[];
  /** 'date' shows event date + location (media library style); 'filesize' shows type + size (collection style). */
  metaMode?: 'date' | 'filesize';
  /** Optional extra content rendered inside each card (e.g. a "needs review" badge). */
  renderExtra?: (asset: GalleryAsset) => ReactNode;
  /** When set, links carry ?collectionId= so the asset detail page can offer prev/next through this same list. */
  collectionId?: string;
  /** When set, links carry this query string instead (e.g. the Media Library's current filters,
   * via lib/media-query.ts) so the asset detail page can offer prev/next through that filtered/
   * paginated set. Takes priority over collectionId when both are somehow set. */
  navQuery?: string;
  /** Shows a selection checkbox overlay on each card, for bulk actions (e.g. the media library toolbar). */
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

export default function AssetGallery({
  assets,
  metaMode = 'date',
  renderExtra,
  collectionId,
  navQuery,
  selectable,
  selectedIds,
  onToggleSelect,
}: AssetGalleryProps) {
  function handleCheckboxClick(e: MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    onToggleSelect?.(id);
  }

  // Once at least one asset is selected, clicking anywhere on a card keeps toggling selection
  // instead of navigating — this is what lets picking several images stay a single click each,
  // without needing every click to land precisely on the small checkbox.
  function handleCardClick(e: MouseEvent<HTMLAnchorElement>, id: string) {
    if (selectable && selectedIds && selectedIds.size > 0) {
      e.preventDefault();
      onToggleSelect?.(id);
    }
  }

  return (
    <div className="gallery">
      {assets.map((a) => {
        const isSelected = selectable && (selectedIds?.has(a.id) ?? false);
        return (
          <a
            key={a.id}
            href={navQuery ? `/media/${a.id}?${navQuery}` : collectionId ? `/media/${a.id}?collectionId=${collectionId}` : `/media/${a.id}`}
            className={`asset-card${isSelected ? ' asset-card-selected' : ''}`}
            onClick={selectable ? (e) => handleCardClick(e, a.id) : undefined}
          >
            <div className="asset-thumb">
              {selectable && (
                <span
                  className="asset-select-checkbox"
                  onClick={(e) => handleCheckboxClick(e, a.id)}
                  role="checkbox"
                  aria-checked={isSelected}
                  aria-label={`Select ${a.title || 'asset'}`}
                >
                  {isSelected ? '✓' : ''}
                </span>
              )}
              <AssetThumbnail id={a.id} title={a.title} fileType={a.fileType} thumbnailKey={a.thumbnailKey} thumbnailStatus={a.thumbnailStatus} />
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
        );
      })}
    </div>
  );
}
