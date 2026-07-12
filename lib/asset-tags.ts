import { prisma } from './db';

type TagStatus = 'confirmed' | 'suggested' | 'rejected';

// Once a human (or a prior high-confidence pass) has settled a tag's status away from the
// default 'suggested', later reprocessing/backfill passes must not silently overwrite that —
// otherwise a dismissed suggestion would just reappear on the next enrichment run.

export async function upsertPlayerTag(
  assetId: string,
  playerId: string,
  source: string,
  confidence: number | null,
  status: TagStatus,
) {
  const where = { assetId_playerId_source: { assetId, playerId, source } };
  const existing = await prisma.assetPlayerTag.findUnique({ where });
  if (existing && existing.status !== 'suggested') return existing;

  return prisma.assetPlayerTag.upsert({
    where,
    create: { assetId, playerId, source, confidence, status },
    update: { confidence, status },
  });
}

export async function upsertSponsorTag(
  assetId: string,
  sponsorId: string,
  source: string,
  confidence: number | null,
  status: TagStatus,
) {
  const where = { assetId_sponsorId_source: { assetId, sponsorId, source } };
  const existing = await prisma.assetSponsorTag.findUnique({ where });
  if (existing && existing.status !== 'suggested') return existing;

  return prisma.assetSponsorTag.upsert({
    where,
    create: { assetId, sponsorId, source, confidence, status },
    update: { confidence, status },
  });
}

// Appends a `player:slug` / `sponsor:slug` string tag to Asset.detectedTagsJson, idempotently.
// Only ever called for CONFIRMED matches — a 'suggested' (unreviewed) tag must never land here,
// or it becomes indistinguishable from a confirmed tag in the existing free-text search UI.
export async function addConfirmedStringTag(assetId: string, tag: string): Promise<void> {
  const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { detectedTagsJson: true } });
  if (!asset) return;

  const tags: string[] = asset.detectedTagsJson ? JSON.parse(asset.detectedTagsJson) : [];
  if (tags.includes(tag)) return;

  tags.push(tag);
  await prisma.asset.update({ where: { id: assetId }, data: { detectedTagsJson: JSON.stringify(tags) } });
}
