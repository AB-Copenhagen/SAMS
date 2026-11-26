'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewPlaylistForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok) {
        setOpen(false);
        setName('');
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button className="btn-primary" type="button" onClick={() => setOpen(true)}>
        + New playlist
      </button>
    );
  }

  return (
    <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>New playlist</h3>
          <button className="modal-close" type="button" onClick={() => setOpen(false)}>×</button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
              placeholder="Season highlights"
              autoFocus
            />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button className="btn-secondary" type="button" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" type="button" onClick={submit} disabled={saving || !name.trim()}>
              {saving ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
