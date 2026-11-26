import { NextResponse } from 'next/server';
import { verifyQstashSignature } from '../../../../lib/qstash';
import { createPrismaClient } from '../../../../lib/db';
import { processHls } from '../../../../lib/tagging-pipeline';

// 800s to cover lib/video-hls.ts's own 10min Sandbox timeout plus the subsequent per-file Wasabi
// uploads — matches the highest maxDuration already used elsewhere in this project (the cron sync
// jobs), rather than guessing at a new ceiling.
export const maxDuration = 800;
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// QStash job: HLS-transcodes a single video asset. Enqueued once per video asset right after
// upload completes (app/api/ingest/sessions/[id]/complete), and re-enqueued by the reconciliation
// sweep (app/api/cron/process-ingest-jobs) for anything that slips through. Errors are re-thrown
// (not caught) so QStash's own retry/backoff applies; after retries are exhausted, QStash calls
// /api/jobs/failed, which marks the asset hlsStatus: 'failed'.
export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!(await verifyQstashSignature(request, rawBody))) {
    return NextResponse.json({ message: 'Invalid signature' }, { status: 401 });
  }

  const { assetId } = JSON.parse(rawBody) as { assetId: string };
  if (!assetId) return NextResponse.json({ message: 'assetId is required' }, { status: 400 });

  const db = createPrismaClient();
  try {
    await processHls(assetId, db);
    return NextResponse.json({ status: 'ok', assetId });
  } finally {
    await db.$disconnect();
  }
}
