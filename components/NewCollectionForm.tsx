'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Season = { id: string; name: string };

export default function NewCollectionForm({ seasons }: { seasons: Season[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'game', date: '', opponent: '', venue: '', seasonId: '' });
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!form.name.trim()) return;
    setSaving(true);
    const res = await fetch('/api/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) {
      setOpen(false);
      setForm({ name: '', type: 'game', date: '', opponent: '', venue: '', seasonId: '' });
      router.refresh();
    }
  }

  if (!open) {
    return (
      <button className="btn-primary" type="button" onClick={() => setOpen(true)}>
        + New collection
      </button>
    );
  }

  return (
    <div style={{ background: 'white', border: '1px solid #e8ebf5', borderRadius: 12, padding: 20, width: 360 }}>
      <div style={{ fontWeight: 600, marginBottom: 14, fontSize: 14 }}>New collection</div>
      <div className="field">
        <label>Name *</label>
        <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="AB vs Thisted FC" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className="field">
          <label>Type</label>
          <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
            <option value="game">Game</option>
            <option value="training">Training</option>
            <option value="event">Event</option>
            <option value="press">Press</option>
          </select>
        </div>
        <div className="field">
          <label>Date</label>
          <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
        </div>
      </div>
      <div className="field">
        <label>Opponent</label>
        <input value={form.opponent} onChange={(e) => setForm((f) => ({ ...f, opponent: e.target.value }))} placeholder="FC Nordsjælland" />
      </div>
      <div className="field">
        <label>Venue</label>
        <input value={form.venue} onChange={(e) => setForm((f) => ({ ...f, venue: e.target.value }))} placeholder="Gladsaxe Stadion" />
      </div>
      <div className="field">
        <label>Season</label>
        <select value={form.seasonId} onChange={(e) => setForm((f) => ({ ...f, seasonId: e.target.value }))}>
          <option value="">No season</option>
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
        <button className="btn-secondary" type="button" onClick={() => setOpen(false)}>Cancel</button>
        <button className="btn-primary" type="button" onClick={submit} disabled={saving}>
          {saving ? 'Saving…' : 'Create'}
        </button>
      </div>
    </div>
  );
}
