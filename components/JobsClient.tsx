'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

type CronRun = {
  id: string; startedAt: string; finishedAt: string | null; durationMs: number | null;
  status: string; errorMessage: string | null;
  facesDone: number; facesSkipped: number; facesFailed: number; facesStillPending: number;
  thumbsDone: number; thumbsSkipped: number; thumbsFailed: number; thumbsStillPending: number;
  uploadsAborted: number;
};
type QueuedAsset = { id: string; title: string | null; objectKey: string; uploadedAt: string; faceTagAttempts: number };
type QueueStatus = {
  faceTagging: { pending: number; done: number; failed: number; skipped: number };
  thumbnails: { pending: number; done: number; failed: number; skipped: number };
  pendingAssets: QueuedAsset[];
  failedAssets: QueuedAsset[];
};
type SuggestedCounts = { playerTagsSuggested: number; sponsorTagsSuggested: number };
type ApproveResult = { playerTagsConfirmed: number; sponsorTagsConfirmed: number; assetsClosed: number };

const CRON_INTERVAL_MS = 15 * 60 * 1000;

function nextCronRunAt(from: number): number {
  return Math.ceil((from + 1000) / CRON_INTERVAL_MS) * CRON_INTERVAL_MS;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'any moment now';
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatRelative(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function assetLabel(a: QueuedAsset) {
  return a.title || a.objectKey.split('/').pop();
}

export default function JobsClient() {
  const [now, setNow] = useState(() => Date.now());
  const [queue, setQueue] = useState<QueueStatus | null>(null);
  const [runs, setRuns] = useState<CronRun[] | null>(null);
  const [suggested, setSuggested] = useState<SuggestedCounts | null>(null);
  const [approving, setApproving] = useState(false);
  const [approveResult, setApproveResult] = useState<ApproveResult | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<{ id: string; message: string } | null>(null);

  const loadQueue = useCallback(async () => {
    const res = await fetch('/api/system/queue-status');
    if (res.ok) setQueue(await res.json());
  }, []);
  const loadRuns = useCallback(async () => {
    const res = await fetch('/api/system/cron-runs?limit=20');
    if (res.ok) setRuns(await res.json());
  }, []);
  const loadSuggested = useCallback(async () => {
    const res = await fetch('/api/system/bulk-approve-suggested-tags');
    if (res.ok) setSuggested(await res.json());
  }, []);

  async function approveAllSuggested() {
    if (!confirm('Confirm every currently-suggested player/sponsor tag and close out the assets they belong to?')) return;
    setApproving(true);
    setApproveResult(null);
    try {
      const res = await fetch('/api/system/bulk-approve-suggested-tags', { method: 'POST' });
      if (res.ok) {
        setApproveResult(await res.json());
        await Promise.all([loadSuggested(), loadQueue()]);
      }
    } finally {
      setApproving(false);
    }
  }

  // Re-runs face/jersey/sponsor identification for one asset that previously exhausted its QStash
  // retries and landed at faceTagStatus 'failed' (the cron reconciliation sweep only re-enqueues
  // still-'pending' assets, never 'failed' ones — see app/api/cron/process-ingest-jobs — so a
  // failure needs an explicit retry once whatever caused it, e.g. an oversized image, is fixed).
  // Reuses the same synchronous endpoint as the asset detail page's "Identify players" button.
  async function retryFailed(assetId: string) {
    setRetryingId(assetId);
    setRetryError(null);
    try {
      const res = await fetch(`/api/assets/${assetId}/tag-faces`, { method: 'POST' });
      if (res.ok) {
        await loadQueue();
      } else {
        const body = await res.json().catch(() => ({})) as { message?: string };
        setRetryError({ id: assetId, message: body.message ?? 'Retry failed' });
      }
    } finally {
      setRetryingId(null);
    }
  }

  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clock);
  }, []);

  useEffect(() => {
    loadQueue();
    loadRuns();
    loadSuggested();
    const qi = setInterval(loadQueue, 10000);
    const ri = setInterval(loadRuns, 15000);
    return () => { clearInterval(qi); clearInterval(ri); };
  }, [loadQueue, loadRuns, loadSuggested]);

  const lastRun = runs?.[0];
  const msUntilNext = nextCronRunAt(now) - now;

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Next reconciliation sweep</div>
        <div style={{ fontSize: 20, fontWeight: 600 }}>{formatCountdown(msUntilNext)}</div>
        <div style={{ fontSize: 12, color: '#8890b4', marginTop: 4 }}>
          New uploads are tagged within seconds via a QStash job queue — this sweep runs every 15
          minutes and only re-enqueues stragglers (timing is approximate)
          {lastRun && (
            <>
              {' · last run '}{formatRelative(lastRun.startedAt)}
              {lastRun.status === 'error'   && <span style={{ color: '#dc2626' }}> · failed</span>}
              {lastRun.status === 'running' && <span> · still running</span>}
              {(lastRun.facesSkipped > 0 || lastRun.thumbsSkipped > 0) && (
                <span style={{ color: '#dc2626' }}> · QSTASH_TOKEN not configured, jobs not enqueued</span>
              )}
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Player/sponsor tagging queue</div>
          {queue ? (
            <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
              <div><strong>{queue.faceTagging.pending}</strong> pending</div>
              <div><strong style={{ color: '#16a34a' }}>{queue.faceTagging.done}</strong> done</div>
              <div style={{ color: queue.faceTagging.failed > 0 ? '#dc2626' : undefined }}>
                <strong>{queue.faceTagging.failed}</strong> failed
              </div>
            </div>
          ) : <p style={{ color: '#8890b4', fontSize: 13 }}>Loading…</p>}
        </div>
        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Thumbnail queue</div>
          {queue ? (
            <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
              <div><strong>{queue.thumbnails.pending}</strong> pending</div>
              <div><strong style={{ color: '#16a34a' }}>{queue.thumbnails.done}</strong> done</div>
              <div style={{ color: queue.thumbnails.failed > 0 ? '#dc2626' : undefined }}>
                <strong>{queue.thumbnails.failed}</strong> failed
              </div>
            </div>
          ) : <p style={{ color: '#8890b4', fontSize: 13 }}>Loading…</p>}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Suggested tag backlog</div>
        <p style={{ fontSize: 12, color: '#8890b4', marginTop: 0, marginBottom: 12 }}>
          The tagging pipeline auto-confirms every player/sponsor match it finds, so this should
          normally sit at zero. Use this as a manual backstop to clear any suggested tags that do
          show up (e.g. from a manual match import) without reviewing them one at a time.
        </p>
        {suggested ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 13, flexWrap: 'wrap' }}>
            <div><strong>{suggested.playerTagsSuggested}</strong> suggested player tag(s)</div>
            <div><strong>{suggested.sponsorTagsSuggested}</strong> suggested sponsor tag(s)</div>
            <button
              className="btn-primary"
              type="button"
              disabled={approving || (suggested.playerTagsSuggested === 0 && suggested.sponsorTagsSuggested === 0)}
              onClick={approveAllSuggested}
            >
              {approving ? 'Approving…' : 'Accept all suggested tags'}
            </button>
          </div>
        ) : <p style={{ color: '#8890b4', fontSize: 13 }}>Loading…</p>}
        {approveResult && (
          <div style={{ fontSize: 12, color: '#16a34a', marginTop: 8 }}>
            Confirmed {approveResult.playerTagsConfirmed} player and {approveResult.sponsorTagsConfirmed} sponsor
            tag(s), closed {approveResult.assetsClosed} asset(s) out of the review queue.
          </div>
        )}
      </div>

      {queue && (queue.pendingAssets.length > 0 || queue.failedAssets.length > 0) && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Waiting on tagging</div>
          <div className="config-list">
            {queue.failedAssets.map((a) => (
              <div key={a.id} className="config-item">
                <div className="config-item-info">
                  <div className="config-item-title">
                    {assetLabel(a)} <span style={{ color: '#dc2626', fontWeight: 400 }}>· failed</span>
                  </div>
                  <div className="config-item-sub">
                    uploaded {formatRelative(a.uploadedAt)} · gave up after {a.faceTagAttempts} attempts
                  </div>
                  {retryError?.id === a.id && (
                    <div style={{ fontSize: 12, color: '#dc2626', marginTop: 4 }}>{retryError.message}</div>
                  )}
                </div>
                <button
                  className="btn-secondary"
                  type="button"
                  disabled={retryingId === a.id}
                  onClick={() => retryFailed(a.id)}
                  style={{ marginRight: 8 }}
                >
                  {retryingId === a.id ? 'Retrying…' : 'Retry'}
                </button>
                <Link className="btn-secondary" href={`/media/${a.id}`}>View</Link>
              </div>
            ))}
            {queue.pendingAssets.map((a) => (
              <div key={a.id} className="config-item">
                <div className="config-item-info">
                  <div className="config-item-title">{assetLabel(a)}</div>
                  <div className="config-item-sub">
                    uploaded {formatRelative(a.uploadedAt)}
                    {a.faceTagAttempts > 0 ? ` · retried ${a.faceTagAttempts}x` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Recent reconciliation sweeps</div>
        <div className="config-list">
          {runs?.map((r) => (
            <div key={r.id} className="config-item">
              <div className="config-item-info">
                <div className="config-item-title">
                  {new Date(r.startedAt).toLocaleString()}
                  {' '}
                  <span style={{
                    fontWeight: 400,
                    color: r.status === 'error' ? '#dc2626' : r.status === 'running' ? '#8890b4' : '#16a34a',
                  }}>
                    · {r.status}
                  </span>
                </div>
                <div className="config-item-sub">
                  {r.status === 'error' ? r.errorMessage : (
                    `${r.facesStillPending} tagging job(s) re-enqueued · ${r.thumbsStillPending} thumbnail job(s) re-enqueued`
                    + (r.uploadsAborted ? ` · ${r.uploadsAborted} stuck upload(s) aborted` : '')
                    + (r.durationMs != null ? ` · ${(r.durationMs / 1000).toFixed(1)}s` : '')
                  )}
                  {(r.facesSkipped > 0 || r.thumbsSkipped > 0) && (
                    <span style={{ color: '#dc2626' }}>
                      {' · '}{r.facesSkipped} tagging + {r.thumbsSkipped} thumbnail job(s) skipped (QSTASH_TOKEN not configured)
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
          {runs && runs.length === 0 && (
            <div className="empty-state" style={{ padding: '24px 0' }}><p>No reconciliation sweeps recorded yet.</p></div>
          )}
          {!runs && <p style={{ color: '#8890b4', fontSize: 13 }}>Loading…</p>}
        </div>
      </div>
    </div>
  );
}
