'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Player = { id: string; name: string; number: number | null };
type Sponsor = { id: string; name: string };

interface Props {
  collectionId: string;
  playerRules: { id: string; player: Player }[];
  sponsorRules: { id: string; sponsor: Sponsor }[];
  allPlayers: Player[];
  allSponsors: Sponsor[];
}

export default function CollectionRulesEditor({ collectionId, playerRules, sponsorRules, allPlayers, allSponsors }: Props) {
  const router = useRouter();
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [selectedSponsorId, setSelectedSponsorId] = useState('');
  const [saving, setSaving] = useState(false);

  const availablePlayers = allPlayers.filter((p) => !playerRules.some((r) => r.player.id === p.id));
  const availableSponsors = allSponsors.filter((s) => !sponsorRules.some((r) => r.sponsor.id === s.id));

  async function addRule(body: { playerId?: string; sponsorId?: string }) {
    setSaving(true);
    try {
      await fetch(`/api/collections/${collectionId}/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function removeRule(ruleId: string) {
    setSaving(true);
    try {
      await fetch(`/api/collections/${collectionId}/rules/${ruleId}`, { method: 'DELETE' });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>Auto-include rules</h3>
      <p style={{ color: '#6b7491', fontSize: 13, marginTop: -8 }}>
        Any asset with a confirmed tag matching one of these players or sponsors is automatically included.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <label style={{ fontWeight: 600, fontSize: 13 }}>Players</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 0' }}>
            {playerRules.map((r) => (
              <span key={r.id} className="tag-chip">
                {r.player.name}{r.player.number != null ? ` #${r.player.number}` : ''}
                <button type="button" className="tag-remove" disabled={saving} onClick={() => removeRule(r.id)} aria-label="Remove">×</button>
              </span>
            ))}
            {playerRules.length === 0 && <span style={{ color: '#8890b4', fontSize: 13 }}>No player rules yet</span>}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <select value={selectedPlayerId} onChange={(e) => setSelectedPlayerId(e.target.value)} style={{ flex: 1 }}>
              <option value="">Add a player…</option>
              {availablePlayers.map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.number != null ? ` #${p.number}` : ''}</option>
              ))}
            </select>
            <button
              className="btn-secondary"
              type="button"
              disabled={saving || !selectedPlayerId}
              onClick={async () => { await addRule({ playerId: selectedPlayerId }); setSelectedPlayerId(''); }}
            >
              Add
            </button>
          </div>
        </div>

        <div>
          <label style={{ fontWeight: 600, fontSize: 13 }}>Sponsors</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 0' }}>
            {sponsorRules.map((r) => (
              <span key={r.id} className="tag-chip">
                {r.sponsor.name}
                <button type="button" className="tag-remove" disabled={saving} onClick={() => removeRule(r.id)} aria-label="Remove">×</button>
              </span>
            ))}
            {sponsorRules.length === 0 && <span style={{ color: '#8890b4', fontSize: 13 }}>No sponsor rules yet</span>}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <select value={selectedSponsorId} onChange={(e) => setSelectedSponsorId(e.target.value)} style={{ flex: 1 }}>
              <option value="">Add a sponsor…</option>
              {availableSponsors.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <button
              className="btn-secondary"
              type="button"
              disabled={saving || !selectedSponsorId}
              onClick={async () => { await addRule({ sponsorId: selectedSponsorId }); setSelectedSponsorId(''); }}
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
