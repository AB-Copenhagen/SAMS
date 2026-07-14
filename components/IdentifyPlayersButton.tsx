'use client';

import { useState } from 'react';

type Status = 'idle' | 'identifying' | 'done' | 'error';

interface Props {
  assetId: string;
  onComplete: (result: { players: string[]; sponsors: string[]; playerIds: string[]; sponsorIds: string[] }) => void;
}

export default function IdentifyPlayersButton({ assetId, onComplete }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError]   = useState('');

  async function run() {
    setStatus('identifying');
    setError('');

    try {
      const res = await fetch(`/api/assets/${assetId}/tag-faces`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(body.message ?? 'Identification failed');
      }
      const data = await res.json() as { players?: string[]; sponsors?: string[]; playerIds?: string[]; sponsorIds?: string[] };
      setStatus('done');
      onComplete({
        players: data.players ?? [],
        sponsors: data.sponsors ?? [],
        playerIds: data.playerIds ?? [],
        sponsorIds: data.sponsorIds ?? [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
    }
  }

  if (status === 'done') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#22863a' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        Players &amp; sponsors identified
      </div>
    );
  }

  const busy = status === 'identifying';

  return (
    <div>
      <button
        type="button"
        className="btn-secondary"
        style={{ width: '100%', justifyContent: 'center', gap: 6 }}
        onClick={run}
        disabled={busy}
      >
        {busy ? (
          <>
            <span className="spinner" />
            Identifying…
          </>
        ) : (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            Identify players &amp; sponsors
          </>
        )}
      </button>
      {status === 'error' && (
        <div className="alert alert-error" style={{ marginTop: 8, fontSize: 12 }}>{error}</div>
      )}
    </div>
  );
}
