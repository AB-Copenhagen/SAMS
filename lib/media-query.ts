import { prisma } from './db';

export type MediaLibraryFilters = {
  q?: string;
  type?: string;
  seasonId?: string;
  category?: string;
  collectionId?: string;
  playerIds?: string[];
  sponsorIds?: string[];
  rating?: number;
};

// Shared between the /media grid query, the query string its asset cards link out with, and the
// asset-detail page's prev/next nav context — all three must agree on both "which assets are in
// the filtered set" and "what gets a detail page back to that same context", or prev/next would
// silently drift from what the grid actually showed (see REVIEWABLE_ASSET_WHERE in
// lib/asset-review.ts for the same must-stay-identical concern elsewhere in this codebase).
export function buildMediaLibraryWhere(f: MediaLibraryFilters): Record<string, unknown> {
  const AND: Record<string, unknown>[] = [];
  if (f.q) AND.push({ OR: [{ title: { contains: f.q } }, { eventName: { contains: f.q } }, { location: { contains: f.q } }, { detectedTagsJson: { contains: f.q } }, { manualTagsJson: { contains: f.q } }] });
  if (f.type === 'image') AND.push({ fileType: { startsWith: 'image/' } });
  if (f.type === 'video') AND.push({ fileType: { startsWith: 'video/' } });
  if (f.seasonId) AND.push({ seasonId: f.seasonId });
  if (f.category) AND.push({ category: f.category });
  if (f.collectionId) AND.push({ collectionId: f.collectionId });
  if (f.playerIds?.length) AND.push({ playerTags: { some: { playerId: { in: f.playerIds }, status: 'confirmed' } } });
  if (f.sponsorIds?.length) AND.push({ sponsorTags: { some: { sponsorId: { in: f.sponsorIds }, status: 'confirmed' } } });
  if (f.rating) AND.push({ rating: { gte: f.rating } });
  return AND.length ? { AND } : {};
}

// navFrom=media is the signal an asset-detail page uses to tell this filtered-set nav context
// apart from the unrelated ?collectionId= a /collections/[id] gallery link uses for its own nav
// context (getCollectionNavContext) — both can carry a collectionId (this one as just another
// filter), so the sentinel is what disambiguates, not the param's presence.
export function mediaNavQueryString(f: MediaLibraryFilters): string {
  const params = new URLSearchParams();
  params.set('navFrom', 'media');
  if (f.q) params.set('q', f.q);
  if (f.type) params.set('type', f.type);
  if (f.seasonId) params.set('seasonId', f.seasonId);
  if (f.category) params.set('category', f.category);
  if (f.collectionId) params.set('collectionId', f.collectionId);
  if (f.playerIds?.length) params.set('playerIds', f.playerIds.join(','));
  if (f.sponsorIds?.length) params.set('sponsorIds', f.sponsorIds.join(','));
  if (f.rating) params.set('rating', String(f.rating));
  return params.toString();
}

// Full ordered id list for the current filters — not windowed to one page — so prev/next can step
// across a page boundary the same way the collection-based nav context already steps across an
// entire collection regardless of how the grid paginates it.
export async function getMediaLibraryNavContext(f: MediaLibraryFilters): Promise<string[]> {
  const where = buildMediaLibraryWhere(f);
  const assets = await prisma.asset.findMany({ where, orderBy: { uploadedAt: 'desc' }, select: { id: true } });
  return assets.map((a) => a.id);
}
