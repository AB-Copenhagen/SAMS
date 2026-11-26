import type { Asset, Playlist, PlaylistItem } from '@prisma/client';
import { prisma } from './db';

// Playlist (gh-128): a named, staff-curated, manually ordered set of video assets used to
// generate a sequential auto-advancing playback embed. Deliberately its own domain module, not
// folded into lib/collections.ts — a playlist has no relation to Collection membership and its
// own CRUD/ordering concerns don't belong alongside collection-specific logic. The embed
// resolution side (EmbedToken's 'playlist' targetType) still lives in lib/collections.ts
// alongside the 'asset'/'collection' branches it's a sibling of.

export type PlaylistWithItemCount = Playlist & { _count: { items: number } };
export type PlaylistWithItems = Playlist & { items: (PlaylistItem & { asset: Asset })[] };

export async function createPlaylist(name: string, createdBy: string): Promise<Playlist> {
  return prisma.playlist.create({ data: { name, createdBy } });
}

export async function listPlaylists(): Promise<PlaylistWithItemCount[]> {
  return prisma.playlist.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { items: true } } },
  });
}

export async function getPlaylistWithItems(playlistId: string): Promise<PlaylistWithItems | null> {
  return prisma.playlist.findUnique({
    where: { id: playlistId },
    include: { items: { orderBy: { position: 'asc' }, include: { asset: true } } },
  });
}

export async function renamePlaylist(playlistId: string, name: string): Promise<void> {
  await prisma.playlist.update({ where: { id: playlistId }, data: { name } });
}

export async function deletePlaylist(playlistId: string): Promise<void> {
  await prisma.playlist.delete({ where: { id: playlistId } });
}

/** A playlist only ever holds video assets — playback is a sequential auto-advancing video
 * player, with no story for displaying a still image mid-playlist (spec: .dmx/jobs/gh-128/spec.md).
 * addPlaylistItem checks this itself; exported so the Phase 2 API route can also pre-check an
 * asset before offering it in the "add to playlist" picker. */
export function assetIsPlaylistEligible(asset: Pick<Asset, 'fileType'>): boolean {
  return asset.fileType.startsWith('video/');
}

/**
 * Appends an asset to the end of a playlist's order. Rejects a non-video asset and a duplicate
 * membership with a descriptive Error rather than letting a DB constraint fail opaquely — the
 * Phase 2 API route is expected to catch these and map them to 400/409 responses.
 */
export async function addPlaylistItem(playlistId: string, assetId: string, addedBy?: string): Promise<PlaylistItem> {
  const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { fileType: true } });
  if (!asset) throw new Error('Asset not found');
  if (!assetIsPlaylistEligible(asset)) throw new Error('Only video assets can be added to a playlist');

  const existing = await prisma.playlistItem.findUnique({
    where: { playlistId_assetId: { playlistId, assetId } },
  });
  if (existing) throw new Error('Asset is already in this playlist');

  const last = await prisma.playlistItem.findFirst({
    where: { playlistId },
    orderBy: { position: 'desc' },
    select: { position: true },
  });
  return prisma.playlistItem.create({ data: { playlistId, assetId, position: (last?.position ?? -1) + 1, addedBy } });
}

export async function removePlaylistItem(playlistId: string, assetId: string): Promise<void> {
  await prisma.playlistItem.deleteMany({ where: { playlistId, assetId } });
}

/**
 * Replaces a playlist's ordering wholesale from a full, ordered list of its asset ids — the admin
 * UI's drag-reorder posts the entire new order rather than a single move. Sequential awaits, not
 * Promise.all/$transaction — concurrent writes against the Turso/libSQL-backed DB (single-writer
 * semantics) surface as SQLITE_BUSY 500s (gh-107), same reason app/api/collections/[id]/assets
 * writes memberships one at a time.
 */
export async function reorderPlaylistItems(playlistId: string, orderedAssetIds: string[]): Promise<void> {
  for (const [position, assetId] of orderedAssetIds.entries()) {
    await prisma.playlistItem.updateMany({ where: { playlistId, assetId }, data: { position } });
  }
}
