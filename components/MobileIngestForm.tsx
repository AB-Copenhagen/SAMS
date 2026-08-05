'use client';

import { useEffect, useRef, useState } from 'react';
import { uploadViaIngestApi } from '../lib/client-ingest';

const UPLOAD_CONCURRENCY = 3;

type ItemStatus = 'queued' | 'hashing' | 'uploading' | 'done' | 'duplicate' | 'error';

type QueueItem = {
  id: string;
  file: File;
  preview: string | null;
  status: ItemStatus;
  progress?: string;
  errorMsg?: string;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function isMedia(file: File): boolean {
  return file.type.startsWith('image/') || file.type.startsWith('video/');
}

function makePreview(file: File): string | null {
  return file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
}

function Thumb({ item }: { item: QueueItem }) {
  if (item.preview) {
    return (
      <div className="queue-item-thumb">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.preview} alt="" />
      </div>
    );
  }
  return (
    <div className="queue-item-thumb" style={{ fontSize: 18 }}>
      🎬
    </div>
  );
}

export default function MobileIngestForm() {
  const [eventName, setEventName] = useState('');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Revoke object URLs on unmount to avoid leaking memory.
  useEffect(() => {
    return () => {
      queue.forEach((i) => { if (i.preview) URL.revokeObjectURL(i.preview); });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addFiles(files: File[]) {
    const items: QueueItem[] = files.filter(isMedia).map((file) => ({
      id: crypto.randomUUID(), file, preview: makePreview(file), status: 'queued' as ItemStatus,
    }));
    setQueue((q) => [...q, ...items]);
  }

  async function uploadOne(item: QueueItem) {
    const setItem = (patch: Partial<QueueItem>) =>
      setQueue((q) => q.map((i) => (i.id === item.id ? { ...i, ...patch } : i)));

    setItem({ status: 'hashing' });
    try {
      const result = await uploadViaIngestApi(
        item.file,
        { channel: 'mobile', metadata: { eventName: eventName || undefined } },
        (progress) => setItem({ status: 'uploading', progress }),
      );
      setItem(result.duplicate ? { status: 'duplicate' } : { status: 'done' });
    } catch (err) {
      setItem({ status: 'error', errorMsg: err instanceof Error ? err.message : 'Upload failed' });
    }
  }

  async function uploadAll() {
    const pending = queue.filter((i) => i.status === 'queued');
    if (!pending.length || isUploading) return;
    setIsUploading(true);

    let cursor = 0;
    async function worker() {
      while (cursor < pending.length) {
        const item = pending[cursor++];
        await uploadOne(item);
      }
    }
    await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, pending.length) }, worker));

    setIsUploading(false);
  }

  const queuedCount = queue.filter((i) => i.status === 'queued').length;

  return (
    <div>
      <div className="field" style={{ marginBottom: 16 }}>
        <label>Event (optional)</label>
        <input value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="Home vs. FC Rosenberg" />
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => { if (e.target.files) addFiles(Array.from(e.target.files)); e.target.value = ''; }}
      />

      <button
        type="button"
        className="btn-primary"
        style={{ width: '100%', justifyContent: 'center', padding: '16px', fontSize: 16 }}
        onClick={() => inputRef.current?.click()}
      >
        📷 Capture or choose photo/video
      </button>

      {queue.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="queue-list">
            {queue.map((item) => (
              <div key={item.id} className="queue-item">
                <Thumb item={item} />
                <div className="queue-item-info">
                  <div className="queue-item-name">{item.file.name}</div>
                  <div className="queue-item-meta">{formatBytes(item.file.size)}</div>
                </div>
                <div className="queue-item-status">
                  {item.status === 'queued' && 'Queued'}
                  {(item.status === 'hashing' || item.status === 'uploading') && (
                    <><span className="spinner" /> {item.progress ?? 'Working…'}</>
                  )}
                  {item.status === 'done' && <>&#10003; Done</>}
                  {item.status === 'duplicate' && 'Already uploaded'}
                  {item.status === 'error' && <span title={item.errorMsg}>&#10007; Failed</span>}
                </div>
              </div>
            ))}
          </div>
          <div className="mobile-ingest-submit-bar">
            <button
              type="button"
              className="btn-primary"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={uploadAll}
              disabled={isUploading || queuedCount === 0}
            >
              {isUploading ? <><span className="spinner" /> Uploading…</> : `Upload ${queuedCount} file${queuedCount !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
