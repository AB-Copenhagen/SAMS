import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/db';
import { abortMultipartUpload } from '../../../../lib/wasabi';
import { identifyPlayersInImage, AUTO_APPLY_THRESHOLD } from '../../../../lib/rekognition';
import { upsertPlayerTag, upsertSponsorTag, addConfirmedStringTag } from '../../../../lib/asset-tags';
import { matchSponsorTokens } from '../../../../lib/sponsor-matching';
import { generateThumbnail } from '../../../../lib/thumbnail';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const BATCH_SIZE = 20;
const FACE_BATCH_SIZE = 10;
const FACE_MAX_ATTEMPTS = 5;
const THUMBNAIL_BATCH_SIZE = 20;
const THUMBNAIL_MAX_ATTEMPTS = 5;
const STUCK_UPLOAD_TIMEOUT_MS = 6 * 60 * 60 * 1000; // 6h

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured — Vercel Cron requests are trusted by default
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  // Face + jersey-number search (AWS Rekognition) — the only remaining automated tagging step.
  const faceResults = { done: 0, skipped: 0, failed: 0, stillPending: 0 };

  const facePendingAssets = await prisma.asset.findMany({
    where: { faceTagStatus: 'pending' },
    take: FACE_BATCH_SIZE,
    select: { id: true, objectKey: true, faceTagAttempts: true },
  });

  for (const asset of facePendingAssets) {
    try {
      const { faceMatches, jerseyMatches, detectedLines } = await identifyPlayersInImage(asset.objectKey);

      for (const match of faceMatches) {
        const status = match.similarityPct >= AUTO_APPLY_THRESHOLD ? 'confirmed' : 'suggested';
        await upsertPlayerTag(asset.id, match.playerId, 'face', match.similarityPct / 100, status);
        if (status === 'confirmed') {
          const player = await prisma.player.findUnique({ where: { id: match.playerId }, select: { name: true } });
          if (player) await addConfirmedStringTag(asset.id, `player:${player.name.toLowerCase().replace(/\s+/g, '-')}`);
        }
      }
      for (const match of jerseyMatches) {
        const status = match.grounded ? 'confirmed' : 'suggested';
        await upsertPlayerTag(asset.id, match.playerId, 'jersey-ocr', null, status);
        if (status === 'confirmed') {
          const player = await prisma.player.findUnique({ where: { id: match.playerId }, select: { name: true } });
          if (player) await addConfirmedStringTag(asset.id, `player:${player.name.toLowerCase().replace(/\s+/g, '-')}`);
        }
      }

      if (detectedLines.length > 0) {
        const sponsors = await prisma.sponsor.findMany({ where: { active: true }, select: { id: true, name: true, aliasesJson: true } });
        const sponsorMatches = matchSponsorTokens(detectedLines.join(' '), sponsors);
        for (const m of sponsorMatches) {
          const status = m.isFullName ? 'confirmed' : 'suggested';
          await upsertSponsorTag(asset.id, m.sponsorId, 'ocr-text', m.isFullName ? 1.0 : 0.6, status);
          if (status === 'confirmed') {
            const sponsor = sponsors.find((s) => s.id === m.sponsorId);
            if (sponsor) await addConfirmedStringTag(asset.id, `sponsor:${sponsor.name.toLowerCase().replace(/\s+/g, '-')}`);
          }
        }
      }

      await prisma.asset.update({ where: { id: asset.id }, data: { faceTagStatus: 'done' } });
      faceResults.done++;
    } catch (err) {
      console.error('[cron/process-ingest-jobs] identifyPlayersInImage failed for', asset.id, err);
      const attempts = asset.faceTagAttempts + 1;
      await prisma.asset.update({
        where: { id: asset.id },
        data: attempts >= FACE_MAX_ATTEMPTS
          ? { faceTagStatus: 'failed', faceTagAttempts: attempts }
          : { faceTagAttempts: attempts },
      });
      if (attempts >= FACE_MAX_ATTEMPTS) faceResults.failed++;
      else faceResults.stillPending++;
    }
  }

  // Thumbnail generation — cheap, independent of AI tagging, so it's gated only on its own status.
  const thumbnailResults = { done: 0, skipped: 0, failed: 0, stillPending: 0 };

  const thumbnailPendingIds = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Asset"
    WHERE "thumbnailStatus" = 'pending'
    LIMIT ${THUMBNAIL_BATCH_SIZE}
  `;
  const thumbnailPendingAssets = await prisma.asset.findMany({
    where: { id: { in: thumbnailPendingIds.map((r) => r.id) } },
    select: { id: true, objectKey: true, fileType: true, thumbnailAttempts: true },
  });

  for (const asset of thumbnailPendingAssets) {
    if (!asset.fileType.startsWith('image/')) {
      await prisma.asset.update({ where: { id: asset.id }, data: { thumbnailStatus: 'skipped' } });
      thumbnailResults.skipped++;
      continue;
    }

    try {
      const thumbnailKey = await generateThumbnail(asset.objectKey);
      await prisma.asset.update({ where: { id: asset.id }, data: { thumbnailKey, thumbnailStatus: 'done' } });
      thumbnailResults.done++;
    } catch (err) {
      console.error('[cron/process-ingest-jobs] generateThumbnail failed for', asset.id, err);
      const attempts = asset.thumbnailAttempts + 1;
      await prisma.asset.update({
        where: { id: asset.id },
        data: attempts >= THUMBNAIL_MAX_ATTEMPTS
          ? { thumbnailStatus: 'failed', thumbnailAttempts: attempts }
          : { thumbnailAttempts: attempts },
      });
      if (attempts >= THUMBNAIL_MAX_ATTEMPTS) thumbnailResults.failed++;
      else thumbnailResults.stillPending++;
    }
  }

  // Sweep stuck multipart uploads that never completed.
  const stuckCutoff = new Date(Date.now() - STUCK_UPLOAD_TIMEOUT_MS);
  const stuckJobs = await prisma.ingestJob.findMany({
    where: { status: 'uploading', updatedAt: { lt: stuckCutoff } },
    take: BATCH_SIZE,
  });

  let aborted = 0;
  for (const job of stuckJobs) {
    if (job.uploadId) {
      await abortMultipartUpload(job.objectKey, job.uploadId).catch((err) => {
        console.error('[cron/process-ingest-jobs] abortMultipartUpload failed:', err);
      });
    }
    await prisma.ingestJob.update({ where: { id: job.id }, data: { status: 'aborted', errorMessage: 'Stuck upload swept by cron' } });
    aborted++;
  }

  return NextResponse.json({ faces: faceResults, thumbnails: thumbnailResults, aborted });
}
