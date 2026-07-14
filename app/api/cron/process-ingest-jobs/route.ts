import { NextResponse } from 'next/server';
import { createClient as createLibsqlClient, type Client as LibsqlClient } from '@libsql/client';
import { createPrismaClient } from '../../../../lib/db';
import { abortMultipartUpload } from '../../../../lib/wasabi';
import { publishJob } from '../../../../lib/qstash';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';
// See the note on rawLibsqlClient below — kept even though this route no longer polls a batch of
// pending assets every run, since the reconciliation query below is the same repeated-literal
// shape that triggered the original bug.
export const fetchCache = 'force-no-store';

const BATCH_SIZE = 20;
const RECONCILE_BATCH_SIZE = 20;
const STALE_PENDING_MS = 10 * 60 * 1000; // 10min — long enough that a normal QStash job + all retries should have finished
const STUCK_UPLOAD_TIMEOUT_MS = 6 * 60 * 60 * 1000; // 6h
const RUN_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30d — bounds table growth

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured — Vercel Cron requests are trusted by default
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

// Tagging/thumbnails are no longer processed here — see app/api/jobs/tag-asset and
// app/api/jobs/generate-thumbnail, enqueued directly at ingest completion via QStash. This route
// now only handles two periodic reconciliation tasks that don't fit a per-event job model:
//   1. Sweeping multipart uploads that stalled and never completed.
//   2. Re-enqueueing a QStash job for any asset that's been `pending` for an unexpectedly long
//      time — a safety net for "the publish call itself failed at ingest time" or similar gaps.
// Raw @libsql/client is used for the reconciliation SELECT (not Prisma) — this is the same
// repeated-identical-query shape that, run frequently enough via Prisma's engine, previously
// triggered a stale-result bug; raw libsql was stress-tested and never showed it.
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
    return await runReconciliation(db, raw, run.id, startedAt);
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

async function runReconciliation(db: ReturnType<typeof createPrismaClient>, raw: LibsqlClient, runId: string, startedAt: Date) {
  const staleCutoff = new Date(Date.now() - STALE_PENDING_MS).toISOString();

  const staleFaceRows = await raw.execute({
    sql: 'SELECT id FROM "Asset" WHERE faceTagStatus = ? AND uploadedAt < ? LIMIT ?',
    args: ['pending', staleCutoff, RECONCILE_BATCH_SIZE],
  });
  let facesReenqueued = 0;
  for (const row of staleFaceRows.rows) {
    await publishJob('/api/jobs/tag-asset', { assetId: String(row.id) })
      .then(() => facesReenqueued++)
      .catch((err) => console.error('[cron/process-ingest-jobs] failed to re-enqueue tag-asset for', row.id, err));
  }

  const staleThumbRows = await raw.execute({
    sql: 'SELECT id FROM "Asset" WHERE thumbnailStatus = ? AND uploadedAt < ? LIMIT ?',
    args: ['pending', staleCutoff, RECONCILE_BATCH_SIZE],
  });
  let thumbsReenqueued = 0;
  for (const row of staleThumbRows.rows) {
    await publishJob('/api/jobs/generate-thumbnail', { assetId: String(row.id) })
      .then(() => thumbsReenqueued++)
      .catch((err) => console.error('[cron/process-ingest-jobs] failed to re-enqueue generate-thumbnail for', row.id, err));
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
      facesStillPending: facesReenqueued,
      thumbsStillPending: thumbsReenqueued,
      uploadsAborted: aborted,
    },
  });

  return NextResponse.json({ facesReenqueued, thumbsReenqueued, aborted });
}
