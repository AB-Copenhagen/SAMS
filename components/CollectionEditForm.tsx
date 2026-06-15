'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  id: string;
  name: string;
  date: string | null;   // ISO date string YYYY-MM-DD or null
  opponent: string | null;
  venue: string | null;
}

export default function CollectionEditForm({ id, name, date, opponent, venue }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [form, setForm] = useState({ name, date: date ?? '', opponent: opponent ?? '', venue: venue ?? '' });

  function set(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function save() {
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/collections/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:     form.name.trim(),
          date:     form.date || null,
          opponent: form.opponent.trim() || null,
          venue:    form.venue.trim() || null,
        }),
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
    setForm({ name, date: date ?? '', opponent: opponent ?? '', venue: venue ?? '' });
    setError('');
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        className="btn-secondary"
        type="button"
        onClick={() => setEditing(true)}
        style={{ fontSize: 13 }}
      >
        Edit
      </button>
    );
  }

  return (
    <div style={{
      background: 'white',
      border: '1px solid #e8eaf4',
      borderRadius: 10,
      padding: 16,
      marginTop: 12,
      width: '100%',
      maxWidth: 480,
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div className="field" style={{ margin: 0, gridColumn: '1 / -1' }}>
          <label>Name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            autoFocus
          />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Date</label>
          <input
            type="date"
            value={form.date}
            onChange={(e) => set('date', e.target.value)}
          />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Opponent</label>
          <input
            type="text"
            value={form.opponent}
            onChange={(e) => set('opponent', e.target.value)}
            placeholder="e.g. Thisted FC"
          />
        </div>
        <div className="field" style={{ margin: 0, gridColumn: '1 / -1' }}>
          <label>Venue</label>
          <input
            type="text"
            value={form.venue}
            onChange={(e) => set('venue', e.target.value)}
            placeholder="e.g. Gladsaxe Stadion"
          />
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 10 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-primary" type="button" onClick={save} disabled={saving}>
          {saving ? <><span className="spinner" /> Saving…</> : 'Save'}
        </button>
        <button className="btn-secondary" type="button" onClick={cancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </div>
  );
}
