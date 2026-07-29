import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { Prisma, type Asset, type Collection } from '@prisma/client';
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

/**
 * Union of an asset's legacy single-collection FK (game/event collections), manual
 * CollectionAsset membership, and any confirmed player/sponsor tag matching one of the
 * collection's auto-include rules. Shared by the admin collection page and the public share API
 * so membership logic lives in exactly one place.
 */
export async function resolveCollectionAssets(collection: CollectionWithRules): Promise<Asset[]> {
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
  });
}

export type PublicAsset = {
  id: string;
  title: string | null;
  description: string | null;
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
};

/** Whitelist projection for anonymous/public consumption — never leak uploader, review, or raw AI/EXIF fields. */
export function sanitizePublicAsset(asset: Asset): PublicAsset {
  return {
    id: asset.id,
    title: asset.title,
    description: asset.description,
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
  };
}

export async function getPublicCollectionByToken(token: string) {
  return prisma.collection.findUnique({
    where: { shareToken: token },
    include: { playerRules: true, sponsorRules: true },
  });
}
