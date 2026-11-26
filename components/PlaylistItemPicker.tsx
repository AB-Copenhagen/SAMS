'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AssetThumbnail from './AssetThumbnail';

type SearchResult = {
  id: string;
  title: string | null;
  eventName: string | null;
  fileType: string;
  thumbnailKey: string | null;
  thumbnailStatus: string;
};

interface Props {
  playlistId: string;
  existingAssetIds: string[];
}

// Mirrors CollectionAssetPicker — same search/add flow, but fixed to type=video (playlists are
// video-only per spec: .dmx/jobs/gh-128/spec.md) rather than letting the picker surface images
// the add call would just reject.
export default function PlaylistItemPicker({ playlistId, existingAssetIds }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function search() {
    if (!query.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/assets?q=${encodeURIComponent(query.trim())}&type=video`);
      const data = await res.json();
      setResults(data.assets ?? []);
    } finally {
      setSearching(false);
    }
  }

  async function add(assetId: string) {
    setAddingId(assetId);
    setError('');
    try {
      const res = await fetch(`/api/playlists/${playlistId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `Request failed (${res.status})`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setAddingId(null);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>Add videos</h3>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          type="text"
          placeholder="Search videos by title, event, or location…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
          style={{ flex: 1 }}
        />
        <button className="btn-secondary" type="button" onClick={search} disabled={searching}>
          {searching ? 'Searching…' : 'Search'}
        </button>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 10 }}>{error}</div>}

      {results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
          {results.map((a) => {
            const alreadyAdded = existingAssetIds.includes(a.id);
            return (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', border: '1px solid #e8eaf4', borderRadius: 8 }}>
                <div style={{ width: 44, height: 44, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: '#f0f2f7' }}>
                  <AssetThumbnail id={a.id} title={a.title} fileType={a.fileType} thumbnailKey={a.thumbnailKey} thumbnailStatus={a.thumbnailStatus} />
                </div>
                <div style={{ flex: 1, fontSize: 13 }}>{a.title || a.eventName || 'Untitled'}</div>
                <button
                  className="btn-secondary"
                  type="button"
                  disabled={alreadyAdded || addingId === a.id}
                  onClick={() => add(a.id)}
                >
                  {alreadyAdded ? 'Added' : addingId === a.id ? 'Adding…' : 'Add'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
