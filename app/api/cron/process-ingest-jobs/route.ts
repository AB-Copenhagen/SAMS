import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/db';
import { getAirJob } from '../../../../lib/air';
import { enrichFromAirResult } from '../../../../lib/air-enrichment';
import { abortMultipartUpload } from '../../../../lib/wasabi';
import { searchFacesInImage, AUTO_APPLY_THRESHOLD } from '../../../../lib/rekognition';
import { upsertPlayerTag, addConfirmedStringTag } from '../../../../lib/asset-tags';

export const maxDuration = 60;

const BATCH_SIZE = 20;
const FACE_BATCH_SIZE = 10;
const FACE_MAX_ATTEMPTS = 5;
// Crowd/scenery shots are overwhelmingly distant, non-enrolled faces — pure Rekognition cost
// for near-zero identification value, so they're skipped rather than searched.
const FACE_SKIP_TAGS = ['fan-shot', 'stadium-scenery'];
const STUCK_UPLOAD_TIMEOUT_MS = 6 * 60 * 60 * 1000; // 6h

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured — Vercel Cron requests are trusted by default
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const tagged = { completed: 0, failed: 0, stillPending: 0 };

  const pendingAssets = await prisma.asset.findMany({
    where: { aiTagStatus: { in: ['queued', 'processing'] } },
    take: BATCH_SIZE,
    select: { id: true, wasbaiResponseJson: true },
  });

  for (const asset of pendingAssets) {
    const pointer = asset.wasbaiResponseJson ? JSON.parse(asset.wasbaiResponseJson) : null;
    const jobId: string | undefined = pointer?.jobId;
    if (!jobId) {
      await prisma.asset.update({ where: { id: asset.id }, data: { aiTagStatus: 'failed' } });
      tagged.failed++;
      continue;
    }

    try {
      const airJob = await getAirJob(jobId);

      if (airJob.status === 'completed' && airJob.result) {
        await enrichFromAirResult(asset.id, airJob.result);
        await prisma.asset.update({ where: { id: asset.id }, data: { aiTagStatus: 'done' } });
        await prisma.ingestJob.updateMany({
          where: { assetId: asset.id, status: 'processing' },
          data: { status: 'complete', completedAt: new Date() },
        });
        tagged.completed++;
      } else if (airJob.status === 'failed') {
        await prisma.asset.update({ where: { id: asset.id }, data: { aiTagStatus: 'failed' } });
        await prisma.ingestJob.updateMany({
          where: { assetId: asset.id, status: 'processing' },
          data: { status: 'complete', completedAt: new Date(), errorMessage: airJob.error ?? 'AiR tagging failed' },
        });
        tagged.failed++;
      } else {
        await prisma.asset.update({ where: { id: asset.id }, data: { aiTagStatus: airJob.status } });
        tagged.stillPending++;
      }
    } catch (err) {
      console.error('[cron/process-ingest-jobs] getAirJob failed for', asset.id, err);
      tagged.stillPending++;
    }
  }

  // Face search — a genuinely separate external call (Rekognition, not AiR/GCV), gated on
  // aiTagStatus having settled so the shot-type tags used for crowd-shot skipping are available.
  const faceResults = { done: 0, skipped: 0, failed: 0, stillPending: 0 };

  const facePendingAssets = await prisma.asset.findMany({
    where: { faceTagStatus: 'pending', aiTagStatus: { in: ['done', 'failed', 'skipped'] } },
    take: FACE_BATCH_SIZE,
    select: { id: true, objectKey: true, detectedTagsJson: true, faceTagAttempts: true },
  });

  for (const asset of facePendingAssets) {
    const shotTags: string[] = asset.detectedTagsJson ? JSON.parse(asset.detectedTagsJson) : [];
    if (shotTags.some((t) => FACE_SKIP_TAGS.includes(t))) {
      await prisma.asset.update({ where: { id: asset.id }, data: { faceTagStatus: 'skipped' } });
      faceResults.skipped++;
      continue;
    }

    try {
      const matches = await searchFacesInImage(asset.objectKey);
      for (const match of matches) {
        const status = match.similarityPct >= AUTO_APPLY_THRESHOLD ? 'confirmed' : 'suggested';
        await upsertPlayerTag(asset.id, match.playerId, 'face', match.similarityPct / 100, status);
        if (status === 'confirmed') {
          const player = await prisma.player.findUnique({ where: { id: match.playerId }, select: { name: true } });
          if (player) await addConfirmedStringTag(asset.id, `player:${player.name.toLowerCase().replace(/\s+/g, '-')}`);
        }
      }
      await prisma.asset.update({ where: { id: asset.id }, data: { faceTagStatus: 'done' } });
      faceResults.done++;
    } catch (err) {
      console.error('[cron/process-ingest-jobs] searchFacesInImage failed for', asset.id, err);
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

  return NextResponse.json({ ...tagged, faces: faceResults, aborted });
}
