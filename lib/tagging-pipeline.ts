import type { PrismaClient } from '@prisma/client';
import { identifyPlayersInImage } from './rekognition';
import { upsertPlayerTag, upsertSponsorTag, addConfirmedStringTag } from './asset-tags';
import { matchSponsorTokens } from './sponsor-matching';
import { generateThumbnail } from './thumbnail';
import { generateVideoThumbnail } from './video-thumbnail';

// Single-asset processing bodies shared by the QStash job endpoints (app/api/jobs/*) and the
// reconciliation sweep in app/api/cron/process-ingest-jobs — one copy of the actual tagging logic,
// triggered either by a queued job or by the safety-net sweep re-publishing one.

export async function processFaceTagging(assetId: string, db: PrismaClient): Promise<void> {
  const asset = await db.asset.findUnique({ where: { id: assetId }, select: { objectKey: true } });
  if (!asset) return; // asset was deleted since the job was enqueued — nothing to do

  const { faceMatches, jerseyMatches, detectedLines } = await identifyPlayersInImage(asset.objectKey, db);

  // Face matches and jersey-number/name reads are all applied immediately as confirmed tags — no
  // review step — so newly uploaded assets show their players right away. Wrong tags get corrected
  // afterward via the existing manual multi-select / reject actions. This includes ungrounded
  // jersey reads (a number/name detected somewhere in the image but not clearly on a person's
  // torso — e.g. background signage): auto-confirming trades a small false-positive rate for never
  // making anyone wait in a review queue.
  for (const match of faceMatches) {
    await upsertPlayerTag(assetId, match.playerId, 'face', match.similarityPct / 100, 'confirmed', db);
    const player = await db.player.findUnique({ where: { id: match.playerId }, select: { name: true } });
    if (player) await addConfirmedStringTag(assetId, `player:${player.name.toLowerCase().replace(/\s+/g, '-')}`, db);
  }
  for (const match of jerseyMatches) {
    await upsertPlayerTag(assetId, match.playerId, 'jersey-ocr', null, 'confirmed', db);
    const player = await db.player.findUnique({ where: { id: match.playerId }, select: { name: true } });
    if (player) await addConfirmedStringTag(assetId, `player:${player.name.toLowerCase().replace(/\s+/g, '-')}`, db);
  }

  if (detectedLines.length > 0) {
    const sponsors = await db.sponsor.findMany({ where: { active: true }, select: { id: true, name: true, aliasesJson: true } });
    const sponsorMatches = matchSponsorTokens(detectedLines.join(' '), sponsors);
    for (const m of sponsorMatches) {
      await upsertSponsorTag(assetId, m.sponsorId, 'ocr-text', m.isFullName ? 1.0 : 0.6, 'confirmed', db);
      const sponsor = sponsors.find((s) => s.id === m.sponsorId);
      if (sponsor) await addConfirmedStringTag(assetId, `sponsor:${sponsor.name.toLowerCase().replace(/\s+/g, '-')}`, db);
    }
  }

  await db.asset.update({ where: { id: assetId }, data: { faceTagStatus: 'done' } });
}

export async function processThumbnail(assetId: string, db: PrismaClient): Promise<void> {
  const asset = await db.asset.findUnique({ where: { id: assetId }, select: { objectKey: true, fileType: true } });
  if (!asset) return; // asset was deleted since the job was enqueued — nothing to do

  if (asset.fileType.startsWith('video/')) {
    const { thumbnailKey, durationMs, width, height } = await generateVideoThumbnail(asset.objectKey);
    await db.asset.update({
      where: { id: assetId },
      data: { thumbnailKey, thumbnailStatus: 'done', durationMs, videoWidth: width, videoHeight: height },
    });
    return;
  }

  const thumbnailKey = await generateThumbnail(asset.objectKey);
  await db.asset.update({ where: { id: assetId }, data: { thumbnailKey, thumbnailStatus: 'done' } });
}
