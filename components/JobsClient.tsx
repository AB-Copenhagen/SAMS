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

  const loadQueue = useCallback(async () => {
    const res = await fetch('/api/system/queue-status');
    if (res.ok) setQueue(await res.json());
  }, []);
  const loadRuns = useCallback(async () => {
    const res = await fetch('/api/system/cron-runs?limit=20');
    if (res.ok) setRuns(await res.json());
  }, []);

  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clock);
  }, []);

  useEffect(() => {
    loadQueue();
    loadRuns();
    const qi = setInterval(loadQueue, 10000);
    const ri = setInterval(loadRuns, 15000);
    return () => { clearInterval(qi); clearInterval(ri); };
  }, [loadQueue, loadRuns]);

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
                </div>
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
