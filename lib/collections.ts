import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { Prisma, type Collection } from '@prisma/client';
import { prisma } from './db';

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

/** Pulls only the capture timestamp out of the raw EXIF blob — never expose GPS/camera/lens details publicly. */
function extractDateTaken(exifJson: string | null): string | null {
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
