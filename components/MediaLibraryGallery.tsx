'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AssetGallery, { type GalleryAsset } from './AssetGallery';
import EntityMultiSelect from './EntityMultiSelect';

// Bulk downloads reuse the existing single-asset download redirect (GET /api/assets/[id]/download)
// — one browser download per selected asset, triggered via a throwaway <a download> click rather
// than window.open, so it isn't treated as a popup. Staggered slightly since firing many downloads
// in the same tick in a row can cause a browser to silently drop some of them.
const DOWNLOAD_STAGGER_MS = 250;

type CustomCollection = { id: string; name: string };

export default function MediaLibraryGallery({ assets, customCollections = [], navQuery }: { assets: GalleryAsset[]; customCollections?: CustomCollection[]; navQuery?: string }) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [addedMessage, setAddedMessage] = useState('');

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function bulkDelete() {
    const count = selectedIds.size;
    if (!confirm(`Delete ${count} item${count !== 1 ? 's' : ''}? This cannot be undone.`)) return;

    setBusy(true);
    const res = await fetch('/api/assets/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [...selectedIds] }),
    });
    setBusy(false);

    if (res.ok) {
      clearSelection();
      router.refresh();
    } else {
      alert('Delete failed');
    }
  }

  // Purely additive — adds the selection to a custom gallery via CollectionAsset without touching
  // each asset's own match/event Collection assignment (Asset.collectionId), so an asset keeps
  // showing up under its match while also appearing in the custom gallery. Selection is left
  // intact afterward so the same batch can be added to another gallery too.
  async function bulkAddToCollection(collectionId: string) {
    if (!collectionId) return;
    const collection = customCollections.find((c) => c.id === collectionId);
    setBusy(true);
    setAddedMessage('');
    try {
      const res = await fetch(`/api/collections/${collectionId}/assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetIds: [...selectedIds] }),
      });
      if (res.ok) {
        setAddedMessage(`Added ${selectedIds.size} item${selectedIds.size !== 1 ? 's' : ''} to "${collection?.name ?? 'collection'}".`);
      } else {
        alert('Add to collection failed');
      }
    } finally {
      setBusy(false);
    }
  }

  async function bulkDownload() {
    const ids = [...selectedIds];
    for (let i = 0; i < ids.length; i++) {
      const link = document.createElement('a');
      link.href = `/api/assets/${ids[i]}/download`;
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
      if (i < ids.length - 1) await new Promise((resolve) => setTimeout(resolve, DOWNLOAD_STAGGER_MS));
    }
  }

  return (
    <>
      {selectedIds.size > 0 && (
        <div className="bulk-action-bar">
          <span>{selectedIds.size} selected</span>
          {customCollections.length > 0 && (
            <div style={{ width: 220 }}>
              <EntityMultiSelect
                options={customCollections.map((c) => ({ id: c.id, label: c.name }))}
                selected={[]}
                onChange={(ids) => { if (ids[0]) bulkAddToCollection(ids[0]); }}
                placeholder="Add to collection…"
              />
            </div>
          )}
          <button type="button" className="btn-secondary" onClick={bulkDownload} disabled={busy}>Download</button>
          <button type="button" className="btn-danger" onClick={bulkDelete} disabled={busy}>{busy ? 'Deleting…' : 'Delete'}</button>
          <button type="button" className="btn-ghost" onClick={clearSelection} disabled={busy}>Cancel</button>
          {addedMessage && <span style={{ fontSize: 12, color: '#16a34a' }}>{addedMessage}</span>}
        </div>
      )}
      <AssetGallery assets={assets} metaMode="date" selectable selectedIds={selectedIds} onToggleSelect={toggle} navQuery={navQuery} />
    </>
  );
}
