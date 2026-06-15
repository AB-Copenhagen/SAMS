'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useRef, useTransition } from 'react';

type Season = { id: string; name: string };

export default function MediaFilterBar({ seasons }: { seasons: Season[] }) {
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

  function onSearch(value: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setFilter('q', value), 350);
  }

  const hasFilters = !!(searchParams.get('q') || searchParams.get('type') || searchParams.get('seasonId'));

  return (
    <div className="filter-bar">
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
