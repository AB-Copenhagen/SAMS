import { NextResponse } from 'next/server';
import { verifyQstashSignature } from '../../../../lib/qstash';
import { createPrismaClient } from '../../../../lib/db';
import { processThumbnail } from '../../../../lib/tagging-pipeline';

// 180s (vs the 60s default elsewhere) to give video poster extraction (Vercel Sandbox cold
// start + ffmpeg seek over an HTTP range-read) headroom — image thumbnails finish well within
// the old 60s budget regardless.
export const maxDuration = 180;
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// QStash job: generates a thumbnail (or, for video, a poster frame) for a single asset. Enqueued
// once per image/video asset right after upload completes
// (app/api/ingest/sessions/[id]/complete), and re-enqueued by the reconciliation sweep
// (app/api/cron/process-ingest-jobs) for anything that slips through. Errors are re-thrown
// (not caught) so QStash's own retry/backoff applies; after retries are exhausted, QStash calls
// /api/jobs/failed, which marks the asset thumbnailStatus: 'failed'.
export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!(await verifyQstashSignature(request, rawBody))) {
    return NextResponse.json({ message: 'Invalid signature' }, { status: 401 });
  }

  const { assetId } = JSON.parse(rawBody) as { assetId: string };
  if (!assetId) return NextResponse.json({ message: 'assetId is required' }, { status: 400 });

  const db = createPrismaClient();
  try {
    await processThumbnail(assetId, db);
    return NextResponse.json({ status: 'ok', assetId });
  } finally {
    await db.$disconnect();
  }
}
