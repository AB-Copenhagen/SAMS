'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useRef, useTransition } from 'react';
import EntityMultiSelect from './EntityMultiSelect';
import PerPageSelector from './PerPageSelector';

type Season = { id: string; name: string };
type Collection = { id: string; name: string; date: Date | string | null };
type Player = { id: string; name: string; number: number | null };
type Sponsor = { id: string; name: string };

function collectionLabel(c: Collection): string {
  if (!c.date) return c.name;
  const d = new Date(c.date);
  const prefix = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  return `${prefix} · ${c.name}`;
}

export default function MediaFilterBar({
  seasons, collections, players, sponsors, uploaders, perPageOptions, currentPerPage,
}: {
  seasons: Season[]; collections: Collection[]; players: Player[]; sponsors: Sponsor[]; uploaders: string[];
  perPageOptions: number[]; currentPerPage: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setFilter = useCallback(
    (key: string, value: string) => {
      const p = new URLSearchParams(searchParams.toString());
      if (value) p.set(key, value); else p.delete(key);
      p.delete('page');
      startTransition(() => router.push('/media?' + p.toString()));
    },
    [router, searchParams, startTransition]
  );

  const setMultiFilter = useCallback(
    (key: string, ids: string[]) => {
      const p = new URLSearchParams(searchParams.toString());
      if (ids.length) p.set(key, ids.join(',')); else p.delete(key);
      p.delete('page');
      startTransition(() => router.push('/media?' + p.toString()));
    },
    [router, searchParams, startTransition]
  );

  function onSearch(value: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setFilter('q', value), 350);
  }

  const playerIds  = searchParams.get('playerIds')?.split(',').filter(Boolean)  ?? [];
  const sponsorIds = searchParams.get('sponsorIds')?.split(',').filter(Boolean) ?? [];
  const showAll    = searchParams.get('all') === '1';

  const hasFilters = !!(
    searchParams.get('q') || searchParams.get('type') || searchParams.get('seasonId') ||
    searchParams.get('collectionId') || searchParams.get('rating') || searchParams.get('uploaderEmail') ||
    playerIds.length || sponsorIds.length
  );

  return (
    <div className="sticky-sidebar" style={{ opacity: isPending ? 0.6 : 1, transition: 'opacity 150ms' }}>
      <div className="card">
        <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          Filters
          {isPending && <span className="spinner" aria-label="Applying filters…" />}
        </div>

        <div className="field">
          <label>Search</label>
          <input
            type="search"
            placeholder="Title, event, tags…"
            defaultValue={searchParams.get('q') ?? ''}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Type</label>
          <select value={searchParams.get('type') ?? ''} onChange={(e) => setFilter('type', e.target.value)}>
            <option value="">All types</option>
            <option value="image">Photos</option>
            <option value="video">Videos</option>
          </select>
        </div>
        <div className="field">
          <label>Season</label>
          <select value={searchParams.get('seasonId') ?? ''} onChange={(e) => setFilter('seasonId', e.target.value)}>
            <option value="">All seasons</option>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Event</label>
          <select value={searchParams.get('collectionId') ?? ''} onChange={(e) => setFilter('collectionId', e.target.value)}>
            <option value="">All events</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>{collectionLabel(c)}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Rating</label>
          <select value={searchParams.get('rating') ?? ''} onChange={(e) => setFilter('rating', e.target.value)}>
            <option value="">Any rating</option>
            <option value="4">★★★★ only</option>
            <option value="3">★★★ &amp; up</option>
            <option value="2">★★ &amp; up</option>
            <option value="1">★ &amp; up</option>
          </select>
        </div>
        <div className="field">
          <label>Player(s)</label>
          <EntityMultiSelect
            placeholder="Add player…"
            options={players.map((p) => ({ id: p.id, label: p.name + (p.number != null ? ` #${p.number}` : '') }))}
            selected={playerIds}
            onChange={(ids) => setMultiFilter('playerIds', ids)}
          />
        </div>
        <div className="field">
          <label>Sponsor(s)</label>
          <EntityMultiSelect
            placeholder="Add sponsor…"
            options={sponsors.map((s) => ({ id: s.id, label: s.name }))}
            selected={sponsorIds}
            onChange={(ids) => setMultiFilter('sponsorIds', ids)}
          />
        </div>
        <div className="field">
          <label>Photographer</label>
          <select value={searchParams.get('uploaderEmail') ?? ''} onChange={(e) => setFilter('uploaderEmail', e.target.value)}>
            <option value="">All photographers</option>
            {uploaders.map((email) => (
              <option key={email} value={email}>{email}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginBottom: hasFilters ? 12 : 0 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#6b7491' }}>
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setFilter('all', e.target.checked ? '1' : '')}
            />
            Show all time (not just last 30 days)
          </label>
        </div>
        {hasFilters && (
          <button
            className="btn-secondary"
            type="button"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => startTransition(() => router.push('/media'))}
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="card">
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Assets per page</label>
          <PerPageSelector options={perPageOptions} current={currentPerPage} />
        </div>
      </div>
    </div>
  );
}
