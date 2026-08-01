'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DeleteAssetRowButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function deleteAsset() {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setDeleting(true);
    const res = await fetch(`/api/assets/${id}`, { method: 'DELETE' });
    if (res.ok) {
      router.refresh();
    } else {
      setDeleting(false);
      alert('Delete failed');
    }
  }

  return (
    <button
      type="button"
      className="asset-link"
      style={{ color: '#dc2626', background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit' }}
      onClick={deleteAsset}
      disabled={deleting}
    >
      {deleting ? 'Deleting…' : 'Delete'}
    </button>
  );
}
