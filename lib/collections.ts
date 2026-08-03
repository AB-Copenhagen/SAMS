import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { Prisma, type Collection } from '@prisma/client';
import { prisma } from './db';
import { isShareUnlocked } from './share-auth';

const SHARE_TOKEN_BYTES = 18; // ~24 base62 chars

function base62(bytes: Buffer): string {
  return bytes.toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, bytes.length);
}

export function generateShareToken(): string {
  return base62(randomBytes(SHARE_TOKEN_BYTES));
}

export function hashSharePassword(password: string): { salt: string; hash: string } {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

export function verifySharePassword(password: string, salt: string, hash: string): boolean {
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

type CollectionWithRules = Collection & {
  playerRules: { playerId: string }[];
  sponsorRules: { sponsorId: string }[];
};

// A photo can be matched to the same player/sponsor via more than one source (face + jersey-ocr,
// or logo + ocr-text), which creates multiple confirmed rows for the same (assetId, playerId)
// pair by design (each source tracks its own confirmation independently — see lib/asset-tags.ts).
// distinct collapses those back to one row per player/sponsor so "featuring" credits don't list
// the same person twice.
const CONFIRMED_TAGS_INCLUDE = {
  playerTags: { where: { status: 'confirmed' as const }, include: { player: true }, distinct: ['playerId'] },
  sponsorTags: { where: { status: 'confirmed' as const }, include: { sponsor: true }, distinct: ['sponsorId'] },
} satisfies Prisma.AssetInclude;

export type AssetWithTags = Prisma.AssetGetPayload<{ include: typeof CONFIRMED_TAGS_INCLUDE }>;

/**
 * Union of an asset's legacy single-collection FK (game/event collections), manual
 * CollectionAsset membership, and any confirmed player/sponsor tag matching one of the
 * collection's auto-include rules. Shared by the admin collection page and the public share API
 * so membership logic lives in exactly one place. Always includes confirmed player/sponsor tags
 * so callers can show "featuring" credits without a second query.
 */
export async function resolveCollectionAssets(collection: CollectionWithRules): Promise<AssetWithTags[]> {
  const playerIds = collection.playerRules.map((r) => r.playerId);
  const sponsorIds = collection.sponsorRules.map((r) => r.sponsorId);

  const or: Prisma.AssetWhereInput[] = [
    { collectionId: collection.id },
    { collectionMemberships: { some: { collectionId: collection.id } } },
  ];
  if (playerIds.length) or.push({ playerTags: { some: { status: 'confirmed', playerId: { in: playerIds } } } });
  if (sponsorIds.length) or.push({ sponsorTags: { some: { status: 'confirmed', sponsorId: { in: sponsorIds } } } });

  return prisma.asset.findMany({
    where: { OR: or },
    orderBy: { uploadedAt: 'desc' },
    include: CONFIRMED_TAGS_INCLUDE,
  });
}

/**
 * Same membership/ordering rules as the collection admin page (legacy FK relation for plain
 * collections, resolveCollectionAssets for custom ones) but id-only — used to drive prev/next
 * navigation on the asset detail page without pulling every asset's full tag data.
 */
export async function getCollectionNavContext(collectionId: string): Promise<{ name: string; assetIds: string[] } | null> {
  const collection = await prisma.collection.findUnique({
    where: { id: collectionId },
    include: {
      assets: { orderBy: { uploadedAt: 'desc' }, select: { id: true } },
      playerRules: true,
      sponsorRules: true,
    },
  });
  if (!collection) return null;

  const assetIds = collection.type === 'custom'
    ? (await resolveCollectionAssets(collection)).map((a) => a.id)
    : collection.assets.map((a) => a.id);

  return { name: collection.name, assetIds };
}

/**
 * Fills eventName/eventDate/seasonId from the assigned Collection wherever the asset's own value
 * is blank — a Collection (the "match") is the source of truth for those fields, but they're
 * denormalized onto Asset for display/filtering, so assigning a collection doesn't retroactively
 * populate them by itself. Never overwrites a value the asset (or an admin) already has, so a
 * deliberately-customized eventName/eventDate survives later saves.
 */
export async function resolveEventFieldDefaults(
  collectionId: string | null,
  current: { eventName: string | null; eventDate: Date | null; seasonId: string | null },
): Promise<{ eventName: string | null; eventDate: Date | null; seasonId: string | null }> {
  if (!collectionId || (current.eventName && current.eventDate && current.seasonId)) return current;

  const collection = await prisma.collection.findUnique({
    where: { id: collectionId },
    select: { name: true, date: true, seasonId: true },
  });
  if (!collection) return current;

  return {
    eventName: current.eventName || collection.name,
    eventDate: current.eventDate || collection.date,
    seasonId: current.seasonId || collection.seasonId,
  };
}

/** Pulls only the capture timestamp out of the raw EXIF blob — never expose GPS/camera/lens details publicly. */
export function extractDateTaken(exifJson: string | null): string | null {
  if (!exifJson) return null;
  try {
    const exif = JSON.parse(exifJson) as { DateTimeOriginal?: string };
    if (!exif.DateTimeOriginal) return null;
    const parsed = new Date(exif.DateTimeOriginal);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  } catch {
    return null;
  }
}

// ±36h around an asset's EXIF capture time — wide enough to catch a late-kickoff/away-travel
// photo landing just past local midnight, without reaching into an unrelated week.
const EXIF_MATCH_WINDOW_MS = 36 * 60 * 60 * 1000;

/**
 * Fallback for when an asset has no manually-assigned collection (e.g. mobile ingest has no
 * collection picker, or nobody bothered on bulk upload): matches its EXIF capture time against
 * Collection.date. Ties — more than one Collection within the window, e.g. a doubleheader —
 * resolve to whichever is closest by full timestamp rather than left unmatched. Returns null if
 * there's no EXIF capture time or nothing within the window at all.
 */
export async function matchCollectionByCaptureDate(exifJson: string | null): Promise<{ collectionId: string; seasonId: string | null } | null> {
  const takenIso = extractDateTaken(exifJson);
  if (!takenIso) return null;
  const takenMs = new Date(takenIso).getTime();

  const candidates = await prisma.collection.findMany({
    where: { date: { gte: new Date(takenMs - EXIF_MATCH_WINDOW_MS), lte: new Date(takenMs + EXIF_MATCH_WINDOW_MS) } },
    select: { id: true, date: true, seasonId: true },
  });
  if (candidates.length === 0) return null;

  let best = candidates[0];
  let bestDiff = Math.abs(best.date!.getTime() - takenMs);
  for (const c of candidates.slice(1)) {
    const diff = Math.abs(c.date!.getTime() - takenMs);
    if (diff < bestDiff) { best = c; bestDiff = diff; }
  }
  return { collectionId: best.id, seasonId: best.seasonId };
}

/** Same fallback chain as the public gallery's client-side sort: EXIF capture time, then event date, then upload date. */
function assetEffectiveDate(asset: Pick<AssetWithTags, 'exifJson' | 'eventDate' | 'uploadedAt'>): Date {
  const taken = extractDateTaken(asset.exifJson);
  if (taken) return new Date(taken);
  return asset.eventDate ?? asset.uploadedAt;
}

type ShareFilterConfig = Pick<Collection, 'shareMinRating' | 'shareDateRangeDays'>;

/**
 * Admin-configured constraints on what a public share link exposes — independent of collection
 * membership itself (a manually-added or rule-matched asset can still be filtered out of the
 * *shared* view without being removed from the collection). Applied only in public-facing code
 * paths; the admin collection page always shows full membership for management.
 */
export function applyShareFilters<T extends AssetWithTags>(assets: T[], collection: ShareFilterConfig): T[] {
  return assets.filter((asset) => {
    if (collection.shareMinRating && (asset.rating ?? 0) < collection.shareMinRating) return false;
    if (collection.shareDateRangeDays) {
      const cutoff = Date.now() - collection.shareDateRangeDays * 24 * 60 * 60 * 1000;
      if (assetEffectiveDate(asset).getTime() < cutoff) return false;
    }
    return true;
  });
}

export type PublicAsset = {
  id: string;
  title: string | null;
  description: string | null;
  shareText: string | null;
  fileType: string;
  fileSize: number;
  thumbnailKey: string | null;
  thumbnailStatus: string;
  eventDate: Date | null;
  eventName: string | null;
  location: string | null;
  category: string | null;
  durationMs: number | null;
  videoWidth: number | null;
  videoHeight: number | null;
  uploadedAt: Date;
  dateTaken: string | null;
  rating: number | null;
  tags: {
    players: { id: string; name: string; number: number | null }[];
    sponsors: { id: string; name: string }[];
  };
};

/** Whitelist projection for anonymous/public consumption — never leak uploader, review, or raw AI/EXIF fields. */
export function sanitizePublicAsset(asset: AssetWithTags): PublicAsset {
  return {
    id: asset.id,
    title: asset.title,
    description: asset.description,
    shareText: asset.shareText,
    fileType: asset.fileType,
    fileSize: asset.fileSize,
    thumbnailKey: asset.thumbnailKey,
    thumbnailStatus: asset.thumbnailStatus,
    eventDate: asset.eventDate,
    eventName: asset.eventName,
    location: asset.location,
    category: asset.category,
    durationMs: asset.durationMs,
    videoWidth: asset.videoWidth,
    videoHeight: asset.videoHeight,
    uploadedAt: asset.uploadedAt,
    dateTaken: extractDateTaken(asset.exifJson),
    rating: asset.rating,
    tags: {
      players: asset.playerTags.map((t) => ({ id: t.player.id, name: t.player.name, number: t.player.number })),
      sponsors: asset.sponsorTags.map((t) => ({ id: t.sponsor.id, name: t.sponsor.name })),
    },
  };
}

export async function getPublicCollectionByToken(token: string) {
  return prisma.collection.findUnique({
    where: { shareToken: token },
    include: { playerRules: true, sponsorRules: true },
  });
}

/** Standalone per-asset share link, independent of any collection's public status — admin-generated. */
export async function getAssetByShareToken(token: string): Promise<AssetWithTags | null> {
  return prisma.asset.findFirst({
    where: { shareToken: token, isPublic: true },
    include: CONFIRMED_TAGS_INCLUDE,
  });
}

export type ShareTarget =
  | { kind: 'password-required'; name: string }
  | { kind: 'found'; asset: AssetWithTags }
  | null;

/**
 * Single entry point for resolving a public `/s/[token]/[assetId]` URL (and the matching
 * download/export/thumbnail API routes): the token is tried first as a Collection's share token
 * (existing gallery flow — public + optional password + share filters), then as an Asset's own
 * standalone share token (admin per-asset link, no password gate, independent of the asset's
 * collection being public at all).
 */
export async function resolveShareTarget(token: string, assetId: string): Promise<ShareTarget> {
  const collection = await getPublicCollectionByToken(token);
  if (collection && collection.isPublic) {
    if (collection.sharePasswordHash && !(await isShareUnlocked(token))) {
      return { kind: 'password-required', name: collection.name };
    }
    const assets = applyShareFilters(await resolveCollectionAssets(collection), collection);
    const asset = assets.find((a) => a.id === assetId);
    return asset ? { kind: 'found', asset } : null;
  }

  const asset = await getAssetByShareToken(token);
  return asset && asset.id === assetId ? { kind: 'found', asset } : null;
}
