'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import EntityMultiSelect, { type EntityOption } from './EntityMultiSelect';
import TagInput from './TagInput';

type QueueItem = {
  id: string;
  title: string | null;
  playerIds: string[];
  sponsorIds: string[];
  tags: string[];
};

type RawQueueAsset = {
  id: string;
  title: string | null;
  manualTagsJson: string | null;
  playerIds: string[];
  sponsorIds: string[];
};

function toQueueItem(a: RawQueueAsset): QueueItem {
  let tags: string[] = [];
  try { tags = a.manualTagsJson ? JSON.parse(a.manualTagsJson) : []; } catch { tags = []; }
  return { id: a.id, title: a.title, playerIds: a.playerIds, sponsorIds: a.sponsorIds, tags };
}

const REFILL_THRESHOLD = 5;
const BATCH_LIMIT = 20;

export default function ReviewWorkflowClient({
  playerOptions,
  sponsorOptions,
}: {
  playerOptions: EntityOption[];
  sponsorOptions: EntityOption[];
}) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [remaining, setRemaining] = useState(0);
  const [reviewedThisSession, setReviewedThisSession] = useState(0);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [fetchingMore, setFetchingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [playerIds, setPlayerIds] = useState<string[]>([]);
  const [sponsorIds, setSponsorIds] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);

  const queueRef = useRef(queue);
  queueRef.current = queue;

  const fetchMore = useCallback(async () => {
    setFetchingMore(true);
    try {
      const res = await fetch(`/api/assets/review-queue?limit=${BATCH_LIMIT}`);
      if (!res.ok) return;
      const data = await res.json() as { assets: RawQueueAsset[]; total: number };
      setQueue((prev) => {
        const existingIds = new Set(prev.map((i) => i.id));
        const fresh = data.assets.filter((a) => !existingIds.has(a.id)).map(toQueueItem);
        return [...prev, ...fresh];
      });
      setRemaining(data.total);
    } finally {
      setFetchingMore(false);
      setLoadingInitial(false);
    }
  }, []);

  useEffect(() => { fetchMore(); }, [fetchMore]);

  useEffect(() => {
    if (!fetchingMore && queue.length <= REFILL_THRESHOLD && queue.length < remaining) {
      fetchMore();
    }
  }, [queue.length, remaining, fetchingMore, fetchMore]);

  const current = queue[0];

  // Reset the working draft whenever the current asset changes.
  useEffect(() => {
    if (current) {
      setPlayerIds(current.playerIds);
      setSponsorIds(current.sponsorIds);
      setTags(current.tags);
    }
  }, [current?.id]);

  // Prefetch the next couple of full-res images so advancing feels instant.
  useEffect(() => {
    for (const item of queue.slice(1, 3)) {
      const img = new window.Image();
      img.src = `/api/assets/${item.id}/download`;
    }
  }, [queue]);

  const rateAndAdvance = useCallback(async (rating: number) => {
    const item = queueRef.current[0];
    if (!item) return;

    const payload = { rating, playerIds, sponsorIds, tags };

    // Optimistic advance — don't block the UI on the network round trip.
    setQueue((prev) => prev.slice(1));
    setRemaining((n) => Math.max(0, n - 1));
    setReviewedThisSession((n) => n + 1);
    setError(null);

    try {
      const res = await fetch(`/api/assets/${item.id}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Save failed');
    } catch {
      setReviewedThisSession((n) => Math.max(0, n - 1));
      setRemaining((n) => n + 1);
      setQueue((prev) => [{ ...item, playerIds, sponsorIds, tags }, ...prev]);
      setError(`Failed to save rating for "${item.title || 'Untitled'}" — retry?`);
    }
  }, [playerIds, sponsorIds, tags]);

  const skip = useCallback(() => {
    setQueue((prev) => (prev.length > 1 ? [...prev.slice(1), prev[0]] : prev));
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.repeat) return;
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, [contenteditable="true"]')) return;
      if (e.key >= '1' && e.key <= '4') { e.preventDefault(); rateAndAdvance(Number(e.key)); }
      if (e.key.toLowerCase() === 's') { e.preventDefault(); skip(); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [current?.id, rateAndAdvance, skip]);

  if (loadingInitial) {
    return <div className="card"><p style={{ padding: 20 }}>Loading review queue…</p></div>;
  }

  if (!current) {
    return (
      <div className="empty-state card">
        <h3>All caught up</h3>
        <p>No un-reviewed photos right now.</p>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="alert alert-error" style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <button className="btn-secondary" type="button" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20, alignItems: 'start' }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={current.id}
            src={`/api/assets/${current.id}/download`}
            alt={current.title ?? ''}
            style={{ width: '100%', display: 'block', maxHeight: 640, objectFit: 'contain', background: '#0d0f1c' }}
          />
        </div>

        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{current.title || 'Untitled'}</span>
            <span style={{ fontSize: 12, color: '#8890b4', fontWeight: 400 }}>
              {reviewedThisSession} reviewed · {remaining} remaining
            </span>
          </div>

          <div className="field">
            <label>Tagged players</label>
            <EntityMultiSelect key={`players-${current.id}`} options={playerOptions} selected={playerIds} onChange={setPlayerIds} placeholder="Add player…" />
          </div>
          <div className="field">
            <label>Tagged sponsors</label>
            <EntityMultiSelect key={`sponsors-${current.id}`} options={sponsorOptions} selected={sponsorIds} onChange={setSponsorIds} placeholder="Add sponsor…" />
          </div>
          <div className="field">
            <label>Tags</label>
            <TagInput key={`tags-${current.id}`} tags={tags} onChange={setTags} />
          </div>

          <div className="field">
            <label>Rating</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  className="btn-primary"
                  style={{ justifyContent: 'center', gap: 4 }}
                  onClick={() => rateAndAdvance(n)}
                >
                  {n} ★
                </button>
              ))}
            </div>
          </div>

          <button className="btn-secondary" type="button" onClick={skip} style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}>
            Skip
          </button>
          <p style={{ fontSize: 11.5, color: '#8890b4', marginTop: 10, textAlign: 'center' }}>
            Press 1-4 to rate &amp; advance · S to skip
          </p>
        </div>
      </div>
    </div>
  );
}
