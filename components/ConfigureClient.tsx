'use client';

import { useState, useEffect, useCallback } from 'react';

type Player  = { id: string; name: string; number: number | null; position: string | null; headshotUrl: string | null; active: boolean; team: string | null; seasonId: string | null; season?: { id: string; name: string } | null };
type Sponsor = { id: string; name: string; logoUrl: string | null; tier: string | null; active: boolean };
type Season  = { id: string; name: string; startDate: string | null; endDate: string | null; _count?: { assets: number; collections: number } };
type Stadium = { id: string; name: string; city: string | null };
type Tab     = 'players' | 'sponsors' | 'seasons' | 'stadiums';

function useFetch<T>(url: string, dep: unknown) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(url);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [url]);
  useEffect(() => { load(); }, [load, dep]);
  return { data, loading };
}

async function apiFetch(url: string, method: string, body?: unknown) {
  return fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

type ImportResult = { total: number; created: number; updated: number };

const POSITIONS = ['Goalkeeper', 'Defender', 'Midfielder', 'Forward'];

function PlayersTab() {
  const [v, setV] = useState(0);
  const { data: players, loading } = useFetch<Player[]>('/api/players', v);
  const { data: seasons } = useFetch<Season[]>('/api/seasons', 0);
  const [form, setForm] = useState({ name: '', number: '', position: '', headshotUrl: '' });
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState('');
  const [selected, setSelected] = useState<Player | null>(null);
  const [editing, setEditing] = useState({ name: '', number: '', position: '', headshotUrl: '', team: '', seasonId: '' });
  const [saving, setSaving] = useState(false);

  function openPlayer(p: Player) {
    setSelected(p);
    setEditing({
      name:        p.name,
      number:      p.number != null ? String(p.number) : '',
      position:    p.position    ?? '',
      headshotUrl: p.headshotUrl ?? '',
      team:        p.team        ?? '',
      seasonId:    p.seasonId    ?? '',
    });
  }

  async function savePlayer() {
    if (!selected) return;
    setSaving(true);
    await apiFetch('/api/players/' + selected.id, 'PUT', {
      name:        editing.name,
      number:      editing.number,
      position:    editing.position,
      headshotUrl: editing.headshotUrl,
      team:        editing.team,
      seasonId:    editing.seasonId || null,
      active:      selected.active,
    });
    setSaving(false);
    setSelected(null);
    setV((n) => n + 1);
  }

  async function deletePlayer(id: string) {
    if (!confirm('Delete this player?')) return;
    await apiFetch('/api/players/' + id, 'DELETE');
    setSelected(null);
    setV((n) => n + 1);
  }

  async function importFromAB() {
    setImporting(true);
    setImportResult(null);
    setImportError('');
    const res = await apiFetch('/api/players/import', 'POST');
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      setImportResult(body);
      setV((n) => n + 1);
    } else {
      setImportError(body.message ?? 'Import failed');
    }
    setImporting(false);
  }

  async function add() {
    if (!form.name.trim()) return;
    await apiFetch('/api/players', 'POST', form);
    setForm({ name: '', number: '', position: '', headshotUrl: '' });
    setV((n) => n + 1);
  }

  function ef(key: string, val: string) {
    setEditing((f) => ({ ...f, [key]: val }));
  }

  return (
    <>
      <div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          {importResult && (
            <span style={{ fontSize: 13, color: '#16a34a' }}>
              Imported {importResult.total} players — {importResult.created} new, {importResult.updated} updated
            </span>
          )}
          {importError && <span style={{ fontSize: 13, color: '#dc2626' }}>{importError}</span>}
          <button className="btn-secondary" type="button" onClick={importFromAB} disabled={importing}>
            {importing ? <><span className="spinner" /> Importing…</> : 'Import from ab.dk'}
          </button>
        </div>

        <div className="config-list">
          {loading && <p style={{ color: '#8890b4', fontSize: 13 }}>Loading…</p>}
          {players?.map((p) => (
            <div key={p.id} className="config-item player-row" onClick={() => openPlayer(p)} style={{ cursor: 'pointer' }}>
              <div className="config-avatar">
                {p.headshotUrl ? <img src={`/api/players/${p.id}/headshot`} alt={p.name} /> : p.name.charAt(0)}
              </div>
              <div className="config-item-info">
                <div className="config-item-title">{p.name}{p.number != null ? ` #${p.number}` : ''}</div>
                <div className="config-item-sub">
                  {[p.position, p.team, p.season?.name].filter(Boolean).join(' · ') || 'No details'}
                </div>
              </div>
              <svg style={{ color: '#c0c5dc', flexShrink: 0 }} width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          ))}
          {!loading && !players?.length && (
            <div className="empty-state" style={{ padding: '24px 0' }}><p>No players yet.</p></div>
          )}
        </div>

        <div className="add-form">
          <div className="field">
            <label>Name *</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Jan Andersen" />
          </div>
          <div className="field">
            <label>Jersey #</label>
            <input type="number" value={form.number} onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))} placeholder="10" />
          </div>
          <div className="field">
            <label>Position</label>
            <input value={form.position} onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))} placeholder="Midfielder" />
          </div>
          <div className="field">
            <label>Headshot URL</label>
            <input value={form.headshotUrl} onChange={(e) => setForm((f) => ({ ...f, headshotUrl: e.target.value }))} placeholder="https://…" />
          </div>
          <div className="field" style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn-primary" type="button" onClick={add}>Add player</button>
          </div>
        </div>
      </div>

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{selected.name}</h3>
              <button className="modal-close" type="button" onClick={() => setSelected(null)}>×</button>
            </div>
            <div className="modal-body">
              {selected.headshotUrl && (
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/players/${selected.id}/headshot`}
                    alt={editing.name}
                    style={{ height: 130, borderRadius: 8, objectFit: 'cover', objectPosition: 'top' }}
                  />
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Name</label>
                  <input value={editing.name} onChange={(e) => ef('name', e.target.value)} />
                </div>
                <div className="field">
                  <label>Jersey #</label>
                  <input type="number" value={editing.number} onChange={(e) => ef('number', e.target.value)} placeholder="10" />
                </div>
                <div className="field">
                  <label>Position</label>
                  <select value={editing.position} onChange={(e) => ef('position', e.target.value)}>
                    <option value="">—</option>
                    {POSITIONS.map((pos) => <option key={pos} value={pos}>{pos}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Team / Squad</label>
                  <input value={editing.team} onChange={(e) => ef('team', e.target.value)} placeholder="First Team" />
                </div>
                <div className="field">
                  <label>Season</label>
                  <select value={editing.seasonId} onChange={(e) => ef('seasonId', e.target.value)}>
                    <option value="">No season</option>
                    {seasons?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Headshot URL</label>
                  <input value={editing.headshotUrl} onChange={(e) => ef('headshotUrl', e.target.value)} placeholder="https://…" />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button className="btn-primary" type="button" onClick={savePlayer} disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>
                  {saving ? <><span className="spinner" /> Saving…</> : 'Save changes'}
                </button>
                <button className="btn-danger" type="button" onClick={() => deletePlayer(selected.id)} disabled={saving}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const TIERS = [
  { value: 'title',  label: 'Title'  },
  { value: 'gold',   label: 'Gold'   },
  { value: 'silver', label: 'Silver' },
  { value: 'bronze', label: 'Bronze' },
];

function SponsorsTab() {
  const [v, setV] = useState(0);
  const { data: sponsors, loading } = useFetch<Sponsor[]>('/api/sponsors', v);
  const [form, setForm] = useState({ name: '', tier: '', logoUrl: '' });
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState('');
  const [selected, setSelected] = useState<Sponsor | null>(null);
  const [editing, setEditing] = useState({ name: '', tier: '', logoUrl: '' });
  const [saving, setSaving] = useState(false);

  function openSponsor(s: Sponsor) {
    setSelected(s);
    setEditing({ name: s.name, tier: s.tier ?? '', logoUrl: s.logoUrl ?? '' });
  }

  async function saveSponsor() {
    if (!selected) return;
    setSaving(true);
    await apiFetch('/api/sponsors/' + selected.id, 'PUT', {
      name:    editing.name,
      tier:    editing.tier    || null,
      logoUrl: editing.logoUrl || null,
      active:  selected.active,
    });
    setSaving(false);
    setSelected(null);
    setV((n) => n + 1);
  }

  async function deleteSponsor(id: string) {
    if (!confirm('Delete this sponsor?')) return;
    await apiFetch('/api/sponsors/' + id, 'DELETE');
    setSelected(null);
    setV((n) => n + 1);
  }

  async function importFromAB() {
    setImporting(true);
    setImportResult(null);
    setImportError('');
    const res = await apiFetch('/api/sponsors/import', 'POST');
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      setImportResult(body);
      setV((n) => n + 1);
    } else {
      setImportError(body.message ?? 'Import failed');
    }
    setImporting(false);
  }

  async function add() {
    if (!form.name.trim()) return;
    await apiFetch('/api/sponsors', 'POST', form);
    setForm({ name: '', tier: '', logoUrl: '' });
    setV((n) => n + 1);
  }

  function ef(key: string, val: string) { setEditing((f) => ({ ...f, [key]: val })); }

  const tierLabel = (val: string | null) => TIERS.find((t) => t.value === val)?.label ?? val ?? 'No tier';

  return (
    <>
      <div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          {importResult && (
            <span style={{ fontSize: 13, color: '#16a34a' }}>
              Imported {importResult.total} sponsors — {importResult.created} new, {importResult.updated} updated
            </span>
          )}
          {importError && <span style={{ fontSize: 13, color: '#dc2626' }}>{importError}</span>}
          <button className="btn-secondary" type="button" onClick={importFromAB} disabled={importing}>
            {importing ? <><span className="spinner" /> Importing…</> : 'Import from ab.dk'}
          </button>
        </div>

        <div className="config-list">
          {loading && <p style={{ color: '#8890b4', fontSize: 13 }}>Loading…</p>}
          {sponsors?.map((s) => (
            <div key={s.id} className="config-item player-row" onClick={() => openSponsor(s)} style={{ cursor: 'pointer' }}>
              <div className="config-avatar" style={{ borderRadius: 8 }}>
                {s.logoUrl ? <img src={`/api/sponsors/${s.id}/logo`} alt={s.name} /> : s.name.charAt(0)}
              </div>
              <div className="config-item-info">
                <div className="config-item-title">{s.name}</div>
                <div className="config-item-sub">{tierLabel(s.tier)}</div>
              </div>
              <svg style={{ color: '#c0c5dc', flexShrink: 0 }} width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          ))}
          {!loading && !sponsors?.length && (
            <div className="empty-state" style={{ padding: '24px 0' }}><p>No sponsors yet.</p></div>
          )}
        </div>

        <div className="add-form">
          <div className="field">
            <label>Name *</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Main Sponsor A/S" />
          </div>
          <div className="field">
            <label>Tier</label>
            <select value={form.tier} onChange={(e) => setForm((f) => ({ ...f, tier: e.target.value }))}>
              <option value="">Select tier</option>
              {TIERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Logo URL</label>
            <input value={form.logoUrl} onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))} placeholder="https://…" />
          </div>
          <div className="field" style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn-primary" type="button" onClick={add}>Add sponsor</button>
          </div>
        </div>
      </div>

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{selected.name}</h3>
              <button className="modal-close" type="button" onClick={() => setSelected(null)}>×</button>
            </div>
            <div className="modal-body">
              {selected.logoUrl && (
                <div style={{ textAlign: 'center', marginBottom: 20, padding: '12px', background: '#f7f8fc', borderRadius: 8 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/sponsors/${selected.id}/logo`}
                    alt={editing.name}
                    style={{ maxHeight: 80, maxWidth: '100%', objectFit: 'contain' }}
                  />
                </div>
              )}

              <div className="field">
                <label>Name</label>
                <input value={editing.name} onChange={(e) => ef('name', e.target.value)} />
              </div>
              <div className="field">
                <label>Tier</label>
                <select value={editing.tier} onChange={(e) => ef('tier', e.target.value)}>
                  <option value="">No tier</option>
                  {TIERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Logo URL</label>
                <input value={editing.logoUrl} onChange={(e) => ef('logoUrl', e.target.value)} placeholder="https://… or Wasabi key" />
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button className="btn-primary" type="button" onClick={saveSponsor} disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>
                  {saving ? <><span className="spinner" /> Saving…</> : 'Save changes'}
                </button>
                <button className="btn-danger" type="button" onClick={() => deleteSponsor(selected.id)} disabled={saving}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SeasonsTab() {
  const [v, setV] = useState(0);
  const { data: seasons, loading } = useFetch<Season[]>('/api/seasons', v);
  const [form, setForm] = useState({ name: '', startDate: '', endDate: '' });

  async function add() {
    if (!form.name.trim()) return;
    await apiFetch('/api/seasons', 'POST', form);
    setForm({ name: '', startDate: '', endDate: '' });
    setV((n) => n + 1);
  }

  async function remove(id: string) {
    if (!confirm('Delete this season?')) return;
    await apiFetch('/api/seasons/' + id, 'DELETE');
    setV((n) => n + 1);
  }

  function fmt(d: string | null) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  return (
    <div>
      <div className="config-list">
        {loading && <p style={{ color: '#8890b4', fontSize: 13 }}>Loading…</p>}
        {seasons?.map((s) => (
          <div key={s.id} className="config-item">
            <div className="config-item-info">
              <div className="config-item-title">{s.name}</div>
              <div className="config-item-sub">
                {s.startDate && s.endDate ? fmt(s.startDate) + ' – ' + fmt(s.endDate) : 'No dates set'}
                {s._count ? ' · ' + s._count.assets + ' assets · ' + s._count.collections + ' collections' : ''}
              </div>
            </div>
            <button className="btn-danger" type="button" onClick={() => remove(s.id)}>Remove</button>
          </div>
        ))}
        {!loading && !seasons?.length && (
          <div className="empty-state" style={{ padding: '24px 0' }}><p>No seasons yet.</p></div>
        )}
      </div>
      <div className="add-form">
        <div className="field">
          <label>Name *</label>
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="2024-25" />
        </div>
        <div className="field">
          <label>Start date</label>
          <input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
        </div>
        <div className="field">
          <label>End date</label>
          <input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
        </div>
        <div className="field" style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button className="btn-primary" type="button" onClick={add}>Add season</button>
        </div>
      </div>
    </div>
  );
}

function StadiumsTab() {
  const [v, setV] = useState(0);
  const { data: stadiums, loading } = useFetch<Stadium[]>('/api/stadiums', v);
  const [form, setForm] = useState({ name: '', city: '' });

  async function add() {
    if (!form.name.trim()) return;
    await apiFetch('/api/stadiums', 'POST', form);
    setForm({ name: '', city: '' });
    setV((n) => n + 1);
  }

  async function remove(id: string) {
    if (!confirm('Delete this stadium?')) return;
    await apiFetch('/api/stadiums/' + id, 'DELETE');
    setV((n) => n + 1);
  }

  return (
    <div>
      <div className="config-list">
        {loading && <p style={{ color: '#8890b4', fontSize: 13 }}>Loading…</p>}
        {stadiums?.map((s) => (
          <div key={s.id} className="config-item">
            <div className="config-item-info">
              <div className="config-item-title">{s.name}</div>
              <div className="config-item-sub">{s.city ?? 'No city'}</div>
            </div>
            <button className="btn-danger" type="button" onClick={() => remove(s.id)}>Remove</button>
          </div>
        ))}
        {!loading && !stadiums?.length && (
          <div className="empty-state" style={{ padding: '24px 0' }}><p>No stadiums yet.</p></div>
        )}
      </div>
      <div className="add-form">
        <div className="field">
          <label>Name *</label>
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Gladsaxe Stadion" />
        </div>
        <div className="field">
          <label>City</label>
          <input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} placeholder="Gladsaxe" />
        </div>
        <div className="field" style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button className="btn-primary" type="button" onClick={add}>Add stadium</button>
        </div>
      </div>
    </div>
  );
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'players',  label: 'Players'  },
  { id: 'sponsors', label: 'Sponsors' },
  { id: 'seasons',  label: 'Seasons'  },
  { id: 'stadiums', label: 'Stadiums' },
];

export default function ConfigureClient() {
  const [tab, setTab] = useState<Tab>('players');

  return (
    <div>
      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={'tab-btn' + (tab === t.id ? ' active' : '')}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'players'  && <PlayersTab />}
      {tab === 'sponsors' && <SponsorsTab />}
      {tab === 'seasons'  && <SeasonsTab />}
      {tab === 'stadiums' && <StadiumsTab />}
    </div>
  );
}
