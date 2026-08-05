'use client';

import { useState, useEffect, useCallback, useRef, type CSSProperties } from 'react';
import EntityMultiSelect, { type EntityOption } from './EntityMultiSelect';
import TagInput from './TagInput';
import { useSwipe } from '../lib/useSwipe';

type Season     = { id: string; name: string };
type Collection = { id: string; name: string; type: string; date: string | Date | null; seasonId: string | null };

function collectionLabel(c: Collection): string {
  if (!c.date) return c.name;
  const d = new Date(typeof c.date === 'string' ? c.date.includes('T') ? c.date : c.date + 'T12:00:00' : c.date);
  const prefix = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  return `${prefix} · ${c.name}`;
}

type QueueItem = {
  id: string;
  title: string | null;
  fileType: string;
  thumbnailKey: string | null;
  thumbnailStatus: string;
  playerIds: string[];
  sponsorIds: string[];
  tags: string[];
  seasonId: string | null;
  collectionId: string | null;
  dateTaken: string | null;
};

type RawQueueAsset = {
  id: string;
  title: string | null;
  fileType: string;
  thumbnailKey: string | null;
  thumbnailStatus: string;
  manualTagsJson: string | null;
  playerIds: string[];
  sponsorIds: string[];
  seasonId: string | null;
  collectionId: string | null;
  dateTaken: string | null;
};

type ReviewDraft = {
  rating: number;
  playerIds: string[];
  sponsorIds: string[];
  tags: string[];
  seasonId: string | null;
  collectionId: string | null;
};

function toQueueItem(a: RawQueueAsset): QueueItem {
  let tags: string[] = [];
  try { tags = a.manualTagsJson ? JSON.parse(a.manualTagsJson) : []; } catch { tags = []; }
  return {
    id: a.id,
    title: a.title,
    fileType: a.fileType,
    thumbnailKey: a.thumbnailKey,
    thumbnailStatus: a.thumbnailStatus,
    playerIds: a.playerIds,
    sponsorIds: a.sponsorIds,
    tags,
    seasonId: a.seasonId,
    collectionId: a.collectionId,
    dateTaken: a.dateTaken,
  };
}

const REFILL_THRESHOLD = 5;
const BATCH_LIMIT = 20;

const overlayButtonStyle: CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: '50%',
  background: 'rgba(13,15,28,0.65)',
  color: 'white',
  border: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 18,
  cursor: 'pointer',
  flexShrink: 0,
};

export default function ReviewWorkflowClient({
  playerOptions,
  sponsorOptions,
  seasons,
  collections,
}: {
  playerOptions: EntityOption[];
  sponsorOptions: EntityOption[];
  seasons: Season[];
  collections: Collection[];
}) {
  // `items` accumulates every asset fetched this session, in review order, and is never trimmed
  // when one is rated — that's what lets Back revisit and re-rate something already submitted.
  // `drafts` holds what was actually submitted per item id, so re-opening one pre-fills its real
  // values instead of the stale server snapshot, and so "remaining" only decrements the first
  // time an item is rated, not on every edit.
  const [items, setItems] = useState<QueueItem[]>([]);
  const [cursor, setCursor] = useState(0);
  const [drafts, setDrafts] = useState<Map<string, ReviewDraft>>(new Map());
  const [remaining, setRemaining] = useState(0);
  const [reviewedThisSession, setReviewedThisSession] = useState(0);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [fetchingMore, setFetchingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [playerIds, setPlayerIds] = useState<string[]>([]);
  const [sponsorIds, setSponsorIds] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [seasonId, setSeasonId] = useState('');
  const [collectionId, setCollectionId] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [playingVideo, setPlayingVideo] = useState(false);

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;

  const pendingCount = items.length - drafts.size;

  const fetchMore = useCallback(async () => {
    setFetchingMore(true);
    try {
      // excludeIds (every asset already loaded this session) is what keeps this correct even when
      // a just-submitted PATCH hasn't committed reviewedAt on the server yet — see the route's
      // comment. Reading itemsRef here (not the `items` state closed over at callback-creation
      // time) matters since fetchMore is only recreated on mount.
      const res = await fetch('/api/assets/review-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: BATCH_LIMIT, excludeIds: itemsRef.current.map((i) => i.id) }),
      });
      if (!res.ok) return;
      const data = await res.json() as { assets: RawQueueAsset[]; total: number };
      setItems((prev) => {
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
    if (!fetchingMore && pendingCount <= REFILL_THRESHOLD && pendingCount < remaining) {
      fetchMore();
    }
  }, [pendingCount, remaining, fetchingMore, fetchMore]);

  const current = items[cursor] as QueueItem | undefined;

  // Reset the working draft whenever the current asset changes — pre-fill from what was actually
  // submitted if this item was already reviewed this session, otherwise its original tags.
  useEffect(() => {
    if (!current) return;
    const draft = drafts.get(current.id);
    if (draft) {
      setPlayerIds(draft.playerIds);
      setSponsorIds(draft.sponsorIds);
      setTags(draft.tags);
      setSeasonId(draft.seasonId ?? '');
      setCollectionId(draft.collectionId ?? '');
    } else {
      setPlayerIds(current.playerIds);
      setSponsorIds(current.sponsorIds);
      setTags(current.tags);
      setSeasonId(current.seasonId ?? '');
      setCollectionId(current.collectionId ?? '');
    }
    setZoomed(false);
    setPlayingVideo(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  // Prefetch thumbnails (cheap — a few KB each) for the next few items so paging through the
  // gallery feels instant. Full-res originals are opt-in via the zoom toggle, not prefetched.
  useEffect(() => {
    for (const item of items.slice(cursor + 1, cursor + 5)) {
      if (item.fileType.startsWith('video/') && !(item.thumbnailKey && item.thumbnailStatus === 'done')) continue;
      const img = new window.Image();
      img.src = `/api/assets/${item.id}/thumbnail`;
    }
  }, [items, cursor]);

  const advance = useCallback(() => {
    setCursor((c) => Math.min(c + 1, itemsRef.current.length));
  }, []);

  const retreat = useCallback(() => {
    setCursor((c) => Math.max(c - 1, 0));
  }, []);

  const swipeHandlers = useSwipe({ onSwipeLeft: advance, onSwipeRight: retreat });

  const rateAndAdvance = useCallback(async (rating: number) => {
    const item = itemsRef.current[cursorRef.current];
    if (!item) return;

    const wasFirstReview = !draftsRef.current.has(item.id);
    const seasonIdValue = seasonId || null;
    const collectionIdValue = collectionId || null;
    const payload = { rating, playerIds, sponsorIds, tags, seasonId: seasonIdValue, collectionId: collectionIdValue };

    // Optimistic advance — don't block the UI on the network round trip.
    setDrafts((prev) => new Map(prev).set(item.id, { rating, playerIds, sponsorIds, tags, seasonId: seasonIdValue, collectionId: collectionIdValue }));
    if (wasFirstReview) {
      setRemaining((n) => Math.max(0, n - 1));
      setReviewedThisSession((n) => n + 1);
    }
    setError(null);
    advance();

    try {
      const res = await fetch(`/api/assets/${item.id}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Save failed');
    } catch {
      setDrafts((prev) => {
        const next = new Map(prev);
        next.delete(item.id);
        return next;
      });
      if (wasFirstReview) {
        setReviewedThisSession((n) => Math.max(0, n - 1));
        setRemaining((n) => n + 1);
      }
      setError(`Failed to save rating for "${item.title || 'Untitled'}" — retry?`);
    }
  }, [playerIds, sponsorIds, tags, seasonId, collectionId, advance]);

  const skip = useCallback(() => {
    setItems((prev) => {
      const i = cursorRef.current;
      if (i >= prev.length - 1) return prev;
      const next = [...prev];
      const [moved] = next.splice(i, 1);
      next.push(moved);
      return next;
    });
  }, []);

  // No keyboard shortcut for this — 1-4/S are pressed fast during review and a stray keystroke
  // must never delete an asset. Confirm dialog is a deliberate extra guard for the same reason.
  const deleteAndAdvance = useCallback(async () => {
    const item = itemsRef.current[cursorRef.current];
    if (!item) return;
    if (!confirm(`Delete "${item.title || 'Untitled'}"? This cannot be undone.`)) return;

    const priorDraft = draftsRef.current.get(item.id);
    const wasUnreviewed = !priorDraft;
    setDeleting(true);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    // A deleted item can never be revisited, so drop its draft too — otherwise it keeps counting
    // against pendingCount (items.length - drafts.size) without a matching item to account for.
    if (priorDraft) setDrafts((prev) => { const next = new Map(prev); next.delete(item.id); return next; });
    if (wasUnreviewed) setRemaining((n) => Math.max(0, n - 1));
    setError(null);

    try {
      const res = await fetch(`/api/assets/${item.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
    } catch {
      if (wasUnreviewed) setRemaining((n) => n + 1);
      if (priorDraft) setDrafts((prev) => new Map(prev).set(item.id, priorDraft));
      setItems((prev) => {
        const next = [...prev];
        next.splice(cursorRef.current, 0, item);
        return next;
      });
      setError(`Failed to delete "${item.title || 'Untitled'}" — retry?`);
    } finally {
      setDeleting(false);
    }
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.repeat) return;
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key >= '1' && e.key <= '4') { e.preventDefault(); rateAndAdvance(Number(e.key)); }
      if (e.key.toLowerCase() === 's' && !drafts.has(current?.id ?? '')) { e.preventDefault(); skip(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); advance(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); retreat(); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [current?.id, drafts, rateAndAdvance, skip, advance, retreat]);

  if (loadingInitial) {
    return <div className="card"><p style={{ padding: 20 }}>Loading review queue…</p></div>;
  }

  if (!current) {
    if (fetchingMore) {
      return <div className="card"><p style={{ padding: 20 }}>Loading more…</p></div>;
    }
    return (
      <div className="empty-state card">
        <h3>All caught up</h3>
        <p>No un-reviewed photos right now.</p>
        {cursor > 0 && (
          <button className="btn-secondary" type="button" onClick={retreat} style={{ marginTop: 12 }}>
            ← Back to last photo
          </button>
        )}
      </div>
    );
  }

  const currentDraft = drafts.get(current.id);
  const isVideo = current.fileType.startsWith('video/');
  const hasPoster = isVideo && current.thumbnailKey && current.thumbnailStatus === 'done';
  const showVideoElement = isVideo && (playingVideo || !hasPoster);
  const canGoBack = cursor > 0;
  const canGoForward = !(cursor >= items.length - 1 && !fetchingMore && pendingCount >= remaining);

  return (
    <div>
      {error && (
        <div className="alert alert-error" style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <button className="btn-secondary" type="button" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <div className="review-layout">
        <div className="card" style={{ padding: 0, overflow: 'hidden', position: 'relative' }} {...swipeHandlers}>
          {showVideoElement ? (
            <video
              key={current.id}
              src={`/api/assets/${current.id}/download`}
              controls
              autoPlay={playingVideo}
              style={{ width: '100%', display: 'block', maxHeight: 640, background: '#0d0f1c' }}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={current.id}
              src={zoomed ? `/api/assets/${current.id}/download` : `/api/assets/${current.id}/thumbnail`}
              alt={current.title ?? ''}
              onClick={() => (isVideo ? setPlayingVideo(true) : setZoomed((z) => !z))}
              style={{
                width: '100%', display: 'block', maxHeight: 640, objectFit: 'contain',
                background: '#0d0f1c', cursor: 'pointer',
              }}
            />
          )}

          {isVideo && !showVideoElement && (
            <div
              onClick={() => setPlayingVideo(true)}
              style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <span style={{
                width: 64, height: 64, borderRadius: '50%', background: 'rgba(13,15,28,0.65)',
                color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26,
              }}>▶</span>
            </div>
          )}

          {!isVideo && (
            <span
              style={{
                position: 'absolute', top: 10, left: 10, fontSize: 11, fontWeight: 600, color: 'white',
                background: 'rgba(13,15,28,0.65)', padding: '4px 9px', borderRadius: 20, pointerEvents: 'none',
              }}
            >
              {zoomed ? 'Full-res — click to shrink' : 'Click to zoom'}
            </span>
          )}

          <button
            type="button"
            title="Delete asset"
            aria-label="Delete asset"
            onClick={deleteAndAdvance}
            disabled={deleting}
            style={{ ...overlayButtonStyle, position: 'absolute', top: 10, right: 10, background: 'rgba(185,28,28,0.75)' }}
          >
            🗑
          </button>

          <button
            type="button"
            title="Previous"
            aria-label="Previous photo"
            onClick={retreat}
            disabled={!canGoBack}
            style={{
              ...overlayButtonStyle, position: 'absolute', top: '50%', left: 10, transform: 'translateY(-50%)',
              opacity: canGoBack ? 1 : 0.35, cursor: canGoBack ? 'pointer' : 'default',
            }}
          >
            ‹
          </button>
          <button
            type="button"
            title="Next"
            aria-label="Next photo"
            onClick={advance}
            disabled={!canGoForward}
            style={{
              ...overlayButtonStyle, position: 'absolute', top: '50%', right: 10, transform: 'translateY(-50%)',
              opacity: canGoForward ? 1 : 0.35, cursor: canGoForward ? 'pointer' : 'default',
            }}
          >
            ›
          </button>

          <span
            style={{
              position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)',
              fontSize: 11, fontWeight: 600, color: 'white', background: 'rgba(13,15,28,0.65)',
              padding: '4px 9px', borderRadius: 20, pointerEvents: 'none',
            }}
          >
            {cursor + 1} / {items.length}{pendingCount < remaining ? '+' : ''}
          </span>
        </div>

        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{current.title || 'Untitled'}{currentDraft && ' (already reviewed)'}</span>
            <span style={{ fontSize: 12, color: '#8890b4', fontWeight: 400 }}>
              {reviewedThisSession} reviewed · {remaining} remaining
            </span>
          </div>

          {current.dateTaken && (
            <p style={{ fontSize: 12, color: '#8890b4', margin: '0 0 12px' }}>
              📷 Taken {new Date(current.dateTaken).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>Season</label>
              <select value={seasonId} onChange={(e) => setSeasonId(e.target.value)}>
                <option value="">No season</option>
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Match</label>
              <select
                value={collectionId}
                onChange={(e) => {
                  const newCollectionId = e.target.value;
                  setCollectionId(newCollectionId);
                  const collection = collections.find((c) => c.id === newCollectionId);
                  // Selecting a match fills in a still-blank season the same way the asset detail
                  // page does — event name/date are backfilled server-side on save (see the
                  // /review route's resolveEventFieldDefaults call).
                  if (collection && !seasonId && collection.seasonId) setSeasonId(collection.seasonId);
                }}
              >
                <option value="">No match</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>{collectionLabel(c)}</option>
                ))}
              </select>
            </div>
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
                  className={`review-rate-btn ${currentDraft?.rating === n ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ justifyContent: 'center', gap: 4 }}
                  onClick={() => rateAndAdvance(n)}
                  disabled={deleting}
                >
                  {n} ★
                </button>
              ))}
            </div>
          </div>

          {!currentDraft && (
            <button className="btn-secondary" type="button" onClick={skip} disabled={deleting} style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}>
              Skip
            </button>
          )}
          <button className="btn-danger" type="button" onClick={deleteAndAdvance} disabled={deleting} style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
            {deleting ? <><span className="spinner" /> Deleting…</> : 'Delete asset'}
          </button>
          <p style={{ fontSize: 11.5, color: '#8890b4', marginTop: 10, textAlign: 'center' }}>
            1-4 to rate &amp; advance · S to skip · ← → to browse
          </p>
        </div>
      </div>
    </div>
  );
}
