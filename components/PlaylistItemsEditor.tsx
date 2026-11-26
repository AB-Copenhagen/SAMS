'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AssetThumbnail from './AssetThumbnail';

type PlaylistItemAsset = {
  id: string;
  title: string | null;
  eventName: string | null;
  fileType: string;
  thumbnailKey: string | null;
  thumbnailStatus: string;
};

interface Props {
  playlistId: string;
  items: PlaylistItemAsset[]; // already in playback order
}

// Up/down buttons rather than drag-and-drop — there's no drag-and-drop library anywhere in this
// codebase yet, and reordering a handful of playlist items doesn't justify adding one; this stays
// consistent with the rest of the admin UI's plain-button interaction style.
export default function PlaylistItemsEditor({ playlistId, items }: Props) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function reorder(orderedAssetIds: string[]) {
    setError('');
    try {
      const res = await fetch(`/api/playlists/${playlistId}/items`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedAssetIds }),
      });
      if (!res.ok) throw new Error(`Reorder failed (${res.status})`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reorder failed');
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const ids = items.map((a) => a.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setBusyId(items[index].id);
    try {
      await reorder(ids);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(assetId: string) {
    setBusyId(assetId);
    setError('');
    try {
      const res = await fetch(`/api/playlists/${playlistId}/items?assetId=${encodeURIComponent(assetId)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Remove failed (${res.status})`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Remove failed');
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="empty-state card">
        <h3>No videos in this playlist yet</h3>
        <p>Search for a video below and add it — items play in the order shown here.</p>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>Playback order</h3>
      {error && <div className="alert alert-error" style={{ marginBottom: 10 }}>{error}</div>}
      <div className="config-list">
        {items.map((a, i) => (
          <div key={a.id} className="config-item">
            <div className="config-avatar">
              <AssetThumbnail id={a.id} title={a.title} fileType={a.fileType} thumbnailKey={a.thumbnailKey} thumbnailStatus={a.thumbnailStatus} />
            </div>
            <div className="config-item-info">
              <div className="config-item-title">{i + 1}. {a.title || a.eventName || 'Untitled'}</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn-secondary" type="button" disabled={busyId === a.id || i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                ↑
              </button>
              <button className="btn-secondary" type="button" disabled={busyId === a.id || i === items.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                ↓
              </button>
              <button className="btn-secondary" type="button" disabled={busyId === a.id} onClick={() => remove(a.id)} style={{ color: '#c0392b' }}>
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
