import { unstable_cache, revalidateTag } from 'next/cache';
import { prisma } from './db';

// Players/sponsors/seasons/stadiums are read on nearly every admin page (upload, review,
// collection detail) but change rarely — cache the query itself (not the per-request auth check)
// so a burst of page loads shares one Prisma round trip instead of repeating it on every request.
// The 60s revalidate is a safety net; the write routes for each entity call the matching
// invalidate*() below so an edit is visible immediately rather than waiting out the TTL.

export const getCachedPlayers = unstable_cache(
  () => prisma.player.findMany({
    orderBy: { name: 'asc' },
    include: { season: { select: { id: true, name: true } }, _count: { select: { assetTags: true } } },
  }),
  ['lookup-players'],
  { tags: ['players'], revalidate: 60 },
);

export const getCachedSponsors = unstable_cache(
  () => prisma.sponsor.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { assetTags: true } } },
  }),
  ['lookup-sponsors'],
  { tags: ['sponsors'], revalidate: 60 },
);

export const getCachedSeasons = unstable_cache(
  () => prisma.season.findMany({
    orderBy: { startDate: 'desc' },
    include: { _count: { select: { assets: true, collections: true } } },
  }),
  ['lookup-seasons'],
  { tags: ['seasons'], revalidate: 60 },
);

export const getCachedStadiums = unstable_cache(
  () => prisma.stadium.findMany({ orderBy: { name: 'asc' } }),
  ['lookup-stadiums'],
  { tags: ['stadiums'], revalidate: 60 },
);

// Superset of what the media library, asset detail, and collections pages each need (event
// listing, custom-collection dropdowns, per-asset event picker) — callers filter/sort in memory
// rather than each issuing their own uncached prisma.collection.findMany.
export const getCachedCollections = unstable_cache(
  () => prisma.collection.findMany({
    orderBy: { date: 'desc' },
    select: { id: true, name: true, type: true, date: true, seasonId: true },
  }),
  ['lookup-collections'],
  { tags: ['collections'], revalidate: 60 },
);

// Next 16's revalidateTag requires a cache-life profile alongside the tag — { expire: 60 } just
// mirrors the revalidate: 60 above; it doesn't change how long an un-invalidated entry lives.
const PROFILE = { expire: 60 };

export function invalidatePlayers(): void { revalidateTag('players', PROFILE); }
export function invalidateSponsors(): void { revalidateTag('sponsors', PROFILE); }
export function invalidateSeasons(): void { revalidateTag('seasons', PROFILE); }
export function invalidateStadiums(): void { revalidateTag('stadiums', PROFILE); }
export function invalidateCollections(): void { revalidateTag('collections', PROFILE); }
