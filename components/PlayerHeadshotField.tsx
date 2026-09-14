'use client';

import { useRef, useState } from 'react';
import AssetThumbnail from './AssetThumbnail';

type LibraryAsset = {
  id: string;
  title: string | null;
  eventName: string | null;
  fileType: string;
  objectKey: string;
  editedKey: string | null;
  thumbnailKey: string | null;
  thumbnailStatus: string;
};

interface Props {
  playerId: string | null; // null while creating a brand-new player (not yet saved)
  value: string;
  onChange: (headshotUrl: string) => void;
}

// Lets an admin get a photo into a player's headshotUrl field either by uploading a new file
// (POSTs straight to Wasabi via /api/players/[id]/headshot, independent of the Asset/ingest
// pipeline — a headshot isn't a library asset) or by reusing a photo already in the Media
// Library. Either way this only stages the objectKey into the field; PUT /api/players/[id] (the
// form's own Save) is still what commits it and triggers face re-enrollment.
export default function PlayerHeadshotField({ playerId, value, onChange }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  const [browsing, setBrowsing] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LibraryAsset[]>([]);
  const [searching, setSearching] = useState(false);
  const [pickedAsset, setPickedAsset] = useState<LibraryAsset | null>(null);

  async function handleFile(file: File) {
    setUploadError('');
    setPickedAsset(null);
    setLocalPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch(`/api/players/${playerId ?? 'new'}/headshot`, { method: 'POST', body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? 'Upload failed');
      onChange(data.objectKey);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
      setLocalPreview(null);
    } finally {
      setUploading(false);
    }
  }

  async function search() {
    if (!query.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/assets?type=image&q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      setResults(data.assets ?? []);
    } finally {
      setSearching(false);
    }
  }

  function pick(asset: LibraryAsset) {
    setLocalPreview(null);
    setUploadError('');
    setPickedAsset(asset);
    onChange(asset.editedKey ?? asset.objectKey);
    setBrowsing(false);
  }

  const showExistingPreview = !localPreview && !pickedAsset && !!value;

  return (
    <div className="field" style={{ gridColumn: '1 / -1' }}>
      <label>Headshot</label>

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ width: 64, height: 64, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: '#f0f2f7' }}>
          {localPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={localPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : pickedAsset ? (
            <AssetThumbnail
              id={pickedAsset.id}
              title={pickedAsset.title}
              fileType={pickedAsset.fileType}
              thumbnailKey={pickedAsset.thumbnailKey}
              thumbnailStatus={pickedAsset.thumbnailStatus}
            />
          ) : showExistingPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value.startsWith('http') ? value : playerId ? `/api/players/${playerId}/headshot` : value}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : null}
        </div>

        <div style={{ flex: 1, minWidth: 200 }}>
          <input
            value={value}
            onChange={(e) => { setLocalPreview(null); setPickedAsset(null); onChange(e.target.value); }}
            placeholder="https://… or choose one below"
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
            />
            <button className="btn-secondary" type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? <><span className="spinner" /> Uploading…</> : 'Upload photo'}
            </button>
            <button className="btn-secondary" type="button" onClick={() => setBrowsing((b) => !b)}>
              {browsing ? 'Close library' : 'Choose from library'}
            </button>
          </div>
          {uploadError && <div className="alert alert-error" style={{ marginTop: 6, fontSize: 12 }}>{uploadError}</div>}
        </div>
      </div>

      {browsing && (
        <div className="card" style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input
              type="text"
              placeholder="Search the media library by title or event…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
              style={{ flex: 1 }}
            />
            <button className="btn-secondary" type="button" onClick={search} disabled={searching}>
              {searching ? 'Searching…' : 'Search'}
            </button>
          </div>
          {results.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
              {results.map((a) => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', border: '1px solid #e8eaf4', borderRadius: 8 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: '#f0f2f7' }}>
                    <AssetThumbnail id={a.id} title={a.title} fileType={a.fileType} thumbnailKey={a.thumbnailKey} thumbnailStatus={a.thumbnailStatus} />
                  </div>
                  <div style={{ flex: 1, fontSize: 13 }}>{a.title || a.eventName || 'Untitled'}</div>
                  <button className="btn-secondary" type="button" onClick={() => pick(a)}>Use this</button>
                </div>
              ))}
            </div>
          )}
          {!searching && query && results.length === 0 && (
            <p style={{ color: '#8890b4', fontSize: 13, margin: 0 }}>No image assets matched.</p>
          )}
        </div>
      )}
    </div>
  );
}
