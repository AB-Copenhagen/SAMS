'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AssetGallery, { type GalleryAsset } from './AssetGallery';

// Bulk downloads reuse the existing single-asset download redirect (GET /api/assets/[id]/download)
// — one browser download per selected asset, triggered via a throwaway <a download> click rather
// than window.open, so it isn't treated as a popup. Staggered slightly since firing many downloads
// in the same tick in a row can cause a browser to silently drop some of them.
const DOWNLOAD_STAGGER_MS = 250;

export default function MediaLibraryGallery({ assets }: { assets: GalleryAsset[] }) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

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
      <AssetGallery assets={assets} metaMode="date" selectable selectedIds={selectedIds} onToggleSelect={toggle} />
      {selectedIds.size > 0 && (
        <div className="bulk-action-bar">
          <span>{selectedIds.size} selected</span>
          <button type="button" className="btn-secondary" onClick={bulkDownload} disabled={busy}>Download</button>
          <button type="button" className="btn-danger" onClick={bulkDelete} disabled={busy}>{busy ? 'Deleting…' : 'Delete'}</button>
          <button type="button" className="btn-ghost" onClick={clearSelection} disabled={busy}>Cancel</button>
        </div>
      )}
    </>
  );
}
