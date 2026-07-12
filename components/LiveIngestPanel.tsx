'use client';

import { useEffect, useRef, useState } from 'react';

type JobStatus =
  | 'pending' | 'uploading' | 'uploaded' | 'processing' | 'complete'
  | 'failed' | 'aborted' | 'duplicate';

type IngestJob = {
  id: string;
  fileName: string;
  fileSize: number;
  channel: string;
  status: JobStatus;
  errorMessage: string | null;
  partsCompleted: number;
  partsTotal: number | null;
  updatedAt: string;
  device: { name: string } | null;
};

const POLL_INTERVAL_MS = 2500;

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function statusLabel(job: IngestJob): string {
  switch (job.status) {
    case 'pending':    return 'Queued';
    case 'uploading':  return job.partsTotal ? `Uploading (${job.partsCompleted}/${job.partsTotal} parts)` : 'Uploading…';
    case 'uploaded':   return 'Finalizing…';
    case 'processing': return 'Saved — tagging…';
    case 'complete':   return 'Done';
    case 'failed':     return job.errorMessage ?? 'Failed';
    case 'aborted':    return 'Aborted';
    case 'duplicate':  return 'Duplicate — skipped';
    default:           return job.status;
  }
}

function statusColor(status: JobStatus): string {
  if (status === 'complete') return '#16a34a';
  if (status === 'failed' || status === 'aborted') return '#dc2626';
  if (status === 'duplicate') return '#8890b4';
  return '#2563eb';
}

const CHANNEL_LABEL: Record<string, string> = {
  dslr: 'DSLR tether',
  hdd: 'Hard drive import',
  mobile: 'Mobile',
  browser: 'Browser',
};

export default function LiveIngestPanel() {
  const [jobs, setJobs] = useState<IngestJob[]>([]);
  const sinceRef = useRef<string | null>(null);
  const jobsRef = useRef<Map<string, IngestJob>>(new Map());

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const url = new URL('/api/ingest/jobs', window.location.origin);
        if (sinceRef.current) url.searchParams.set('since', sinceRef.current);

        const res = await fetch(url.toString());
        if (res.ok) {
          const data = await res.json() as { jobs: IngestJob[]; serverTime: string };
          for (const job of data.jobs) jobsRef.current.set(job.id, job);
          sinceRef.current = data.serverTime;

          if (!cancelled) {
            const merged = Array.from(jobsRef.current.values())
              .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
              .slice(0, 50);
            setJobs(merged);
          }
        }
      } catch {
        // transient network error — next poll tick will retry
      }
      if (!cancelled) timer = setTimeout(poll, POLL_INTERVAL_MS);
    }

    poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

  const active = jobs.filter((j) => !['complete', 'failed', 'aborted', 'duplicate'].includes(j.status));
  const recent = jobs.filter((j) => ['complete', 'failed', 'aborted', 'duplicate'].includes(j.status)).slice(0, 10);

  if (!jobs.length) return null;

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div className="card-header">
        Live ingest {active.length > 0 && <span style={{ color: '#2563eb' }}>· {active.length} in progress</span>}
      </div>
      <div className="queue-list">
        {[...active, ...recent].map((job) => (
          <div key={job.id} className="queue-item">
            <div className="queue-item-info">
              <div className="queue-item-name">{job.fileName}</div>
              <div className="queue-item-meta">
                {formatBytes(job.fileSize)} · {CHANNEL_LABEL[job.channel] ?? job.channel}
                {job.device ? ` · ${job.device.name}` : ''}
              </div>
            </div>
            <div className="queue-item-status" style={{ color: statusColor(job.status) }}>
              {statusLabel(job)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
