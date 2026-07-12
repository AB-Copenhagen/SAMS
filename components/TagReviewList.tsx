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
            <div className="queue-item-thumb">
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
    </div>
  );
}
