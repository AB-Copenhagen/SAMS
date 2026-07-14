import { NextResponse } from 'next/server';
import { createClient as createLibsqlClient, type Client as LibsqlClient } from '@libsql/client';
import { createPrismaClient } from '../../../../lib/db';
import { abortMultipartUpload } from '../../../../lib/wasabi';
import { identifyPlayersInImage } from '../../../../lib/rekognition';
import { upsertPlayerTag, upsertSponsorTag, addConfirmedStringTag } from '../../../../lib/asset-tags';
import { matchSponsorTokens } from '../../../../lib/sponsor-matching';
import { generateThumbnail } from '../../../../lib/thumbnail';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';
// Next.js patches the global fetch() and applies its own Data Cache to outgoing requests by
// default. @libsql/client's HTTP transport calls fetch() internally, and every poll of this route
// issues the literal same query — which is exactly the shape Next.js's fetch cache would collapse
// into "the first response, forever." `dynamic = 'force-dynamic'` alone did not reliably stop this
// in testing; this is the documented, stronger override for third-party fetch calls specifically.
export const fetchCache = 'force-no-store';

const BATCH_SIZE = 20;
const FACE_BATCH_SIZE = 10;
const FACE_MAX_ATTEMPTS = 5;
const THUMBNAIL_BATCH_SIZE = 20;
const THUMBNAIL_MAX_ATTEMPTS = 5;
const STUCK_UPLOAD_TIMEOUT_MS = 6 * 60 * 60 * 1000; // 6h
const RUN_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30d — bounds table growth at a 2-min cadence

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured — Vercel Cron requests are trusted by default
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

// This route polls the same `status: 'pending'` query dozens of times a day, every day, for as
// long as a given serverless/dev instance stays warm. Prisma's query engine over the libSQL
// adapter has been observed, in exactly this repeated-identical-query pattern, to eventually
// serve a frozen/stale result — writes still commit correctly (confirmed directly against Turso),
// and other Prisma calls with varying parameters are unaffected, but this exact fixed-literal
// SELECT stops reflecting reality on the SAME query re-issued enough times, even from a freshly
// constructed PrismaClient within the same warm process. A raw @libsql/client query (bypassing
// Prisma's engine entirely) was stress-tested side by side and never showed this — so the two
// pending-queue lookups below go through it directly; everything else stays on Prisma.
function rawLibsqlClient(): LibsqlClient {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error('TURSO_DATABASE_URL is not set');
  return createLibsqlClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const db = createPrismaClient();
  const raw = rawLibsqlClient();
  const startedAt = new Date();
  const run = await db.cronRun.create({ data: { startedAt, status: 'running' } });
  db.cronRun.deleteMany({ where: { startedAt: { lt: new Date(Date.now() - RUN_RETENTION_MS) } } })
    .catch((err) => console.error('[cron/process-ingest-jobs] CronRun prune failed:', err));

  try {
    return await runIngestJobs(db, raw, run.id, startedAt);
  } catch (err) {
    const finishedAt = new Date();
    await db.cronRun.update({
      where: { id: run.id },
      data: {
        status: 'error',
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    });
    console.error('[cron/process-ingest-jobs] run failed:', err);
    return NextResponse.json({ message: 'Cron run failed' }, { status: 500 });
  } finally {
    await db.$disconnect();
    raw.close();
  }
}

async function runIngestJobs(db: ReturnType<typeof createPrismaClient>, raw: LibsqlClient, runId: string, startedAt: Date) {
  // Face + jersey-number search (AWS Rekognition) — the only remaining automated tagging step.
  const faceResults = { done: 0, skipped: 0, failed: 0, stillPending: 0 };

  const facePendingRows = await raw.execute({
    sql: 'SELECT id, objectKey, faceTagAttempts FROM "Asset" WHERE faceTagStatus = ? ORDER BY uploadedAt ASC LIMIT ?',
    args: ['pending', FACE_BATCH_SIZE],
  });
  const facePendingAssets = facePendingRows.rows.map((r) => ({
    id: String(r.id),
    objectKey: String(r.objectKey),
    faceTagAttempts: Number(r.faceTagAttempts),
  }));

  for (const asset of facePendingAssets) {
    try {
      const { faceMatches, jerseyMatches, detectedLines } = await identifyPlayersInImage(asset.objectKey, db);

      // All automated detections are applied immediately as confirmed tags — no review step —
      // so newly uploaded assets show their players/sponsors right away. Wrong tags get
      // corrected afterward via the existing manual multi-select / reject actions.
      for (const match of faceMatches) {
        await upsertPlayerTag(asset.id, match.playerId, 'face', match.similarityPct / 100, 'confirmed', db);
        const player = await db.player.findUnique({ where: { id: match.playerId }, select: { name: true } });
        if (player) await addConfirmedStringTag(asset.id, `player:${player.name.toLowerCase().replace(/\s+/g, '-')}`, db);
      }
      for (const match of jerseyMatches) {
        await upsertPlayerTag(asset.id, match.playerId, 'jersey-ocr', null, 'confirmed', db);
        const player = await db.player.findUnique({ where: { id: match.playerId }, select: { name: true } });
        if (player) await addConfirmedStringTag(asset.id, `player:${player.name.toLowerCase().replace(/\s+/g, '-')}`, db);
      }

      if (detectedLines.length > 0) {
        const sponsors = await db.sponsor.findMany({ where: { active: true }, select: { id: true, name: true, aliasesJson: true } });
        const sponsorMatches = matchSponsorTokens(detectedLines.join(' '), sponsors);
        for (const m of sponsorMatches) {
          await upsertSponsorTag(asset.id, m.sponsorId, 'ocr-text', m.isFullName ? 1.0 : 0.6, 'confirmed', db);
          const sponsor = sponsors.find((s) => s.id === m.sponsorId);
          if (sponsor) await addConfirmedStringTag(asset.id, `sponsor:${sponsor.name.toLowerCase().replace(/\s+/g, '-')}`, db);
        }
      }

      await db.asset.update({ where: { id: asset.id }, data: { faceTagStatus: 'done' } });
      faceResults.done++;
    } catch (err) {
      console.error('[cron/process-ingest-jobs] identifyPlayersInImage failed for', asset.id, err);
      const attempts = asset.faceTagAttempts + 1;
      await db.asset.update({
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

  const thumbnailPendingRows = await raw.execute({
    sql: 'SELECT id, objectKey, fileType, thumbnailAttempts FROM "Asset" WHERE thumbnailStatus = ? ORDER BY uploadedAt ASC LIMIT ?',
    args: ['pending', THUMBNAIL_BATCH_SIZE],
  });
  const thumbnailPendingAssets = thumbnailPendingRows.rows.map((r) => ({
    id: String(r.id),
    objectKey: String(r.objectKey),
    fileType: String(r.fileType),
    thumbnailAttempts: Number(r.thumbnailAttempts),
  }));

  for (const asset of thumbnailPendingAssets) {
    if (!asset.fileType.startsWith('image/')) {
      await db.asset.update({ where: { id: asset.id }, data: { thumbnailStatus: 'skipped' } });
      thumbnailResults.skipped++;
      continue;
    }

    try {
      const thumbnailKey = await generateThumbnail(asset.objectKey);
      await db.asset.update({ where: { id: asset.id }, data: { thumbnailKey, thumbnailStatus: 'done' } });
      thumbnailResults.done++;
    } catch (err) {
      console.error('[cron/process-ingest-jobs] generateThumbnail failed for', asset.id, err);
      const attempts = asset.thumbnailAttempts + 1;
      await db.asset.update({
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
  const stuckJobs = await db.ingestJob.findMany({
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
    await db.ingestJob.update({ where: { id: job.id }, data: { status: 'aborted', errorMessage: 'Stuck upload swept by cron' } });
    aborted++;
  }

  const finishedAt = new Date();
  await db.cronRun.update({
    where: { id: runId },
    data: {
      status: 'success',
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      facesDone: faceResults.done,
      facesSkipped: faceResults.skipped,
      facesFailed: faceResults.failed,
      facesStillPending: faceResults.stillPending,
      thumbsDone: thumbnailResults.done,
      thumbsSkipped: thumbnailResults.skipped,
      thumbsFailed: thumbnailResults.failed,
      thumbsStillPending: thumbnailResults.stillPending,
      uploadsAborted: aborted,
    },
  });

  return NextResponse.json({ faces: faceResults, thumbnails: thumbnailResults, aborted });
}
