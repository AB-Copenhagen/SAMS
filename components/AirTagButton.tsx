'use client';

import { useState } from 'react';

type AirStatus = 'idle' | 'submitting' | 'polling' | 'done' | 'error';

interface AirTagResult {
  tags: string[];
  description: string;
  players: string[];
  sponsors: string[];
}

interface Props {
  assetId: string;
  onComplete: (result: AirTagResult) => void;
}

export default function AirTagButton({ assetId, onComplete }: Props) {
  const [status, setStatus] = useState<AirStatus>('idle');
  const [error, setError]   = useState('');

  async function run() {
    setStatus('submitting');
    setError('');

    try {
      // Submit job
      const submitRes = await fetch('/api/air/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId }),
      });
      if (!submitRes.ok) {
        const body = await submitRes.json().catch(() => ({})) as { message?: string };
        throw new Error(body.message ?? 'Failed to start AI analysis');
      }
      const { jobId } = await submitRes.json() as { jobId: string };

      // Poll until complete
      setStatus('polling');
      for (let attempt = 0; attempt < 60; attempt++) {
        await delay(3000);

        const pollRes = await fetch(`/api/air/jobs/${jobId}?assetId=${assetId}`);
        if (!pollRes.ok) throw new Error('Polling error');

        const data = await pollRes.json() as { status: string } & Partial<AirTagResult>;

        if (data.status === 'completed') {
          setStatus('done');
          onComplete({
            tags:        data.tags        ?? [],
            description: data.description ?? '',
            players:     data.players     ?? [],
            sponsors:    data.sponsors    ?? [],
          });
          return;
        }

        if (data.status === 'failed') {
          throw new Error((data as { error?: string }).error ?? 'AI analysis failed');
        }
        // still queued/processing — keep polling
      }
      throw new Error('AI analysis timed out after 3 minutes');
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
        AI tags applied
      </div>
    );
  }

  const busy = status === 'submitting' || status === 'polling';

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
            {status === 'submitting' ? 'Starting…' : 'Analysing…'}
          </>
        ) : (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            Auto-tag with AI
          </>
        )}
      </button>
      {status === 'error' && (
        <div className="alert alert-error" style={{ marginTop: 8, fontSize: 12 }}>{error}</div>
      )}
    </div>
  );
}

function delay(ms: number) {
  return new Promise<void>((res) => setTimeout(res, ms));
}
