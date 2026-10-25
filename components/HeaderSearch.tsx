'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import { visibleNavSections } from './NavLinks';
import type { SearchResponse, SearchResult } from '../app/api/search/route';

const EMPTY_RESULTS: SearchResponse = { assets: [], players: [], sponsors: [], collections: [], customers: [] };

const RECORD_GROUPS: { key: keyof SearchResponse; label: string }[] = [
  { key: 'assets', label: 'Assets' },
  { key: 'customers', label: 'Customers' },
  { key: 'players', label: 'Players' },
  { key: 'sponsors', label: 'Sponsors' },
  { key: 'collections', label: 'Collections' },
];

// Always-visible header search — no Cmd+K modal. The dropdown opens on focus and closes on
// blur/Escape/selection; `onMouseDown` + `preventDefault` on the dropdown stops that blur from
// firing when the pointer lands on a result, so clicks there still register.
export default function HeaderSearch({ role }: { role: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResponse>(EMPTY_RESULTS);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) { setResults(EMPTY_RESULTS); setLoading(false); return; }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        if (res.ok) setResults(await res.json());
      } catch {
        // transient network hiccup — leave the previous results in place rather than erroring
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const goTo = useCallback((href: string) => {
    setOpen(false);
    setQuery('');
    router.push(href);
  }, [router]);

  const navSections = visibleNavSections(role);

  return (
    <Command shouldFilter={false} label="Global search" className="header-search">
      <div className="header-search-input-wrap">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={loading ? 'header-search-icon-loading' : undefined}>
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <Command.Input
          value={query}
          onValueChange={setQuery}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => { if (e.key === 'Escape') { setOpen(false); (e.target as HTMLInputElement).blur(); } }}
          placeholder="Search assets, customers, players, sponsors, collections…"
          className="header-search-input"
        />
      </div>

      {open && (
        <div className="header-search-dropdown" onMouseDown={(e) => e.preventDefault()}>
          <Command.List className="header-search-list">
            <Command.Empty className="header-search-empty">
              {query.trim().length < 2 ? 'Type to search, or jump to a page below.' : loading ? 'Searching…' : 'No results.'}
            </Command.Empty>

            {query.trim().length < 2 && (
              <Command.Group heading="Go to" className="header-search-group">
                {navSections.flatMap((section) => section.items).map((item) => (
                  <Command.Item key={item.href} value={`nav-${item.label}`} onSelect={() => goTo(item.href)} className="header-search-item">
                    {item.icon}
                    <span>{item.label}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {RECORD_GROUPS.map(({ key, label }) => {
              const items: SearchResult[] = results[key];
              if (items.length === 0) return null;
              return (
                <Command.Group key={key} heading={label} className="header-search-group">
                  {items.map((item) => (
                    <Command.Item key={`${key}-${item.id}`} value={`${key}-${item.id}`} onSelect={() => goTo(item.href)} className="header-search-item">
                      <span>{item.label}</span>
                      {item.sublabel && <span className="header-search-item-sub">{item.sublabel}</span>}
                    </Command.Item>
                  ))}
                </Command.Group>
              );
            })}
          </Command.List>
        </div>
      )}
    </Command>
  );
}
