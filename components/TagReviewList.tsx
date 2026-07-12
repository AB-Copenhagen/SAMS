'use client';

import { useState } from 'react';

export type ReviewItem = {
  tagId: string;
  assetId: string;
  title: string | null;
  fileType: string;
  confidence: number | null;
};

interface Props {
  kind: 'player' | 'sponsor';
  items: ReviewItem[];
}

export default function TagReviewList({ kind, items: initialItems }: Props) {
  const [items, setItems] = useState(initialItems);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [preview, setPreview] = useState<ReviewItem | null>(null);

  async function review(tagId: string, assetId: string, status: 'confirmed' | 'rejected') {
    setBusyId(tagId);
    try {
      const res = await fetch(`/api/assets/${assetId}/${kind}-tags/${tagId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setItems((prev) => prev.filter((i) => i.tagId !== tagId));
      }
    } finally {
      setBusyId(null);
    }
  }

  if (!items.length) return null;

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-header">Needs review — {items.length} suggested match{items.length !== 1 ? 'es' : ''}</div>
      <div className="queue-list">
        {items.map((item) => (
          <div key={item.tagId} className="queue-item">
            <div
              className="queue-item-thumb"
              style={{ cursor: item.fileType.startsWith('image/') ? 'pointer' : 'default' }}
              role={item.fileType.startsWith('image/') ? 'button' : undefined}
              tabIndex={item.fileType.startsWith('image/') ? 0 : undefined}
              onClick={() => item.fileType.startsWith('image/') && setPreview(item)}
              onKeyDown={(e) => {
                if (item.fileType.startsWith('image/') && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  setPreview(item);
                }
              }}
            >
              {item.fileType.startsWith('image/') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/assets/${item.assetId}/thumbnail`} alt="" />
              ) : '🎬'}
            </div>
            <div className="queue-item-info">
              <div className="queue-item-name">{item.title || 'Untitled'}</div>
              <div className="queue-item-meta">
                {item.confidence != null ? `${Math.round(item.confidence * 100)}% match` : 'Suggested match'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn-primary"
                type="button"
                disabled={busyId === item.tagId}
                onClick={() => review(item.tagId, item.assetId, 'confirmed')}
              >
                Confirm
              </button>
              <button
                className="btn-danger"
                type="button"
                disabled={busyId === item.tagId}
                onClick={() => review(item.tagId, item.assetId, 'rejected')}
              >
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>

      {preview && (
        <div className="modal-backdrop" onClick={() => setPreview(null)}>
          <div className="modal modal-image" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{preview.title || 'Untitled'}</h3>
              <button className="modal-close" type="button" onClick={() => setPreview(null)}>×</button>
            </div>
            <div className="modal-body">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/assets/${preview.assetId}/download`} alt={preview.title || ''} />
            </div>
            <div style={{ display: 'flex', gap: 8, padding: '0 20px 20px' }}>
              <button
                className="btn-primary"
                type="button"
                disabled={busyId === preview.tagId}
                onClick={async () => { await review(preview.tagId, preview.assetId, 'confirmed'); setPreview(null); }}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                Confirm
              </button>
              <button
                className="btn-danger"
                type="button"
                disabled={busyId === preview.tagId}
                onClick={async () => { await review(preview.tagId, preview.assetId, 'rejected'); setPreview(null); }}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
