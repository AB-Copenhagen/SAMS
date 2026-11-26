'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  id: string;
  name: string;
}

// Mirrors CollectionEditForm's edit/delete toggle shape — a playlist only ever has one editable
// field (name), so there's no multi-field form body, just the rename input.
export default function PlaylistEditForm({ id, name }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [value, setValue] = useState(name);

  async function deletePlaylist() {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setDeleting(true);
    setError('');
    try {
      const res = await fetch(`/api/playlists/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      router.push('/playlists');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
      setDeleting(false);
    }
  }

  async function save() {
    if (!value.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/playlists/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: value.trim() }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setValue(name);
    setError('');
    setEditing(false);
  }

  if (!editing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" type="button" onClick={() => setEditing(true)} style={{ fontSize: 13 }}>
            Rename
          </button>
          <button
            className="btn-secondary"
            type="button"
            onClick={deletePlaylist}
            disabled={deleting}
            style={{ fontSize: 13, color: '#c0392b' }}
          >
            {deleting ? <><span className="spinner" /> Deleting…</> : 'Delete'}
          </button>
        </div>
        {error && <div className="alert alert-error" style={{ fontSize: 12 }}>{error}</div>}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <div className="field" style={{ margin: 0 }}>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
          autoFocus
        />
        {error && <div className="alert alert-error" style={{ fontSize: 12, marginTop: 6 }}>{error}</div>}
      </div>
      <button className="btn-primary" type="button" onClick={save} disabled={saving}>
        {saving ? <><span className="spinner" /> Saving…</> : 'Save'}
      </button>
      <button className="btn-secondary" type="button" onClick={cancel} disabled={saving}>
        Cancel
      </button>
    </div>
  );
}
