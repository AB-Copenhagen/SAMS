'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useRef, useTransition } from 'react';
import EntityMultiSelect from './EntityMultiSelect';

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
  seasons, collections, players, sponsors,
}: {
  seasons: Season[]; collections: Collection[]; players: Player[]; sponsors: Sponsor[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
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

  const hasFilters = !!(
    searchParams.get('q') || searchParams.get('type') || searchParams.get('seasonId') ||
    searchParams.get('collectionId') || playerIds.length || sponsorIds.length
  );

  return (
    <div className="filter-bar" style={{ flexWrap: 'wrap' }}>
      <input
        type="search"
        className="filter-search"
        placeholder="Search by title, event, tags…"
        defaultValue={searchParams.get('q') ?? ''}
        onChange={(e) => onSearch(e.target.value)}
      />
      <select value={searchParams.get('type') ?? ''} onChange={(e) => setFilter('type', e.target.value)}>
        <option value="">All types</option>
        <option value="image">Photos</option>
        <option value="video">Videos</option>
      </select>
      <select value={searchParams.get('seasonId') ?? ''} onChange={(e) => setFilter('seasonId', e.target.value)}>
        <option value="">All seasons</option>
        {seasons.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      <select value={searchParams.get('collectionId') ?? ''} onChange={(e) => setFilter('collectionId', e.target.value)}>
        <option value="">All events</option>
        {collections.map((c) => (
          <option key={c.id} value={c.id}>{collectionLabel(c)}</option>
        ))}
      </select>
      <div style={{ minWidth: 180 }}>
        <EntityMultiSelect
          placeholder="Player(s)…"
          options={players.map((p) => ({ id: p.id, label: p.name + (p.number != null ? ` #${p.number}` : '') }))}
          selected={playerIds}
          onChange={(ids) => setMultiFilter('playerIds', ids)}
        />
      </div>
      <div style={{ minWidth: 180 }}>
        <EntityMultiSelect
          placeholder="Sponsor(s)…"
          options={sponsors.map((s) => ({ id: s.id, label: s.name }))}
          selected={sponsorIds}
          onChange={(ids) => setMultiFilter('sponsorIds', ids)}
        />
      </div>
      {hasFilters && (
        <button
          className="btn-secondary"
          type="button"
          onClick={() => startTransition(() => router.push('/media'))}
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
