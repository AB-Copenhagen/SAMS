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

export async function removeConfirmedStringTag(assetId: string, tag: string): Promise<void> {
  const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { detectedTagsJson: true } });
  if (!asset?.detectedTagsJson) return;

  const tags: string[] = JSON.parse(asset.detectedTagsJson).filter((t: string) => t !== tag);
  await prisma.asset.update({ where: { id: assetId }, data: { detectedTagsJson: JSON.stringify(tags) } });
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

// Reconciles an asset's confirmed player tags with a desired set of player IDs (from the
// asset-detail page's multi-select). Newly-added IDs become 'manual' confirmed tags; IDs that
// were confirmed but are no longer selected are marked 'rejected' (not deleted) so they aren't
// silently recreated by a later enrichment/backfill pass.
export async function syncPlayerTags(assetId: string, desiredPlayerIds: string[], actorEmail: string): Promise<void> {
  const current = await prisma.assetPlayerTag.findMany({
    where: { assetId, status: 'confirmed' },
    include: { player: { select: { name: true } } },
  });

  const toAdd = desiredPlayerIds.filter((id) => !current.some((t) => t.playerId === id));
  const toRemove = current.filter((t) => !desiredPlayerIds.includes(t.playerId));

  for (const playerId of toAdd) {
    await upsertPlayerTag(assetId, playerId, 'manual', null, 'confirmed');
    const player = await prisma.player.findUnique({ where: { id: playerId }, select: { name: true } });
    if (player) await addConfirmedStringTag(assetId, `player:${slugify(player.name)}`);
  }

  for (const tag of toRemove) {
    await prisma.assetPlayerTag.update({
      where: { id: tag.id },
      data: { status: 'rejected', reviewedAt: new Date(), reviewedBy: actorEmail },
    });
    await removeConfirmedStringTag(assetId, `player:${slugify(tag.player.name)}`);
  }
}

export async function syncSponsorTags(assetId: string, desiredSponsorIds: string[], actorEmail: string): Promise<void> {
  const current = await prisma.assetSponsorTag.findMany({
    where: { assetId, status: 'confirmed' },
    include: { sponsor: { select: { name: true } } },
  });

  const toAdd = desiredSponsorIds.filter((id) => !current.some((t) => t.sponsorId === id));
  const toRemove = current.filter((t) => !desiredSponsorIds.includes(t.sponsorId));

  for (const sponsorId of toAdd) {
    await upsertSponsorTag(assetId, sponsorId, 'manual', null, 'confirmed');
    const sponsor = await prisma.sponsor.findUnique({ where: { id: sponsorId }, select: { name: true } });
    if (sponsor) await addConfirmedStringTag(assetId, `sponsor:${slugify(sponsor.name)}`);
  }

  for (const tag of toRemove) {
    await prisma.assetSponsorTag.update({
      where: { id: tag.id },
      data: { status: 'rejected', reviewedAt: new Date(), reviewedBy: actorEmail },
    });
    await removeConfirmedStringTag(assetId, `sponsor:${slugify(tag.sponsor.name)}`);
  }
}
