import { NextResponse } from 'next/server';
import { verifyQstashSignature } from '../../../../lib/qstash';
import { createPrismaClient } from '../../../../lib/db';
import { processFaceTagging } from '../../../../lib/tagging-pipeline';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// QStash job: tags a single asset (face + jersey OCR + sponsor OCR). Enqueued once per image
// asset right after upload completes (app/api/ingest/sessions/[id]/complete), and re-enqueued by
// the reconciliation sweep (app/api/cron/process-ingest-jobs) for anything that slips through.
// Errors are re-thrown (not caught) so QStash's own retry/backoff applies; after retries are
// exhausted, QStash calls /api/jobs/failed, which marks the asset faceTagStatus: 'failed'.
export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!(await verifyQstashSignature(request, rawBody))) {
    return NextResponse.json({ message: 'Invalid signature' }, { status: 401 });
  }

  const { assetId } = JSON.parse(rawBody) as { assetId: string };
  if (!assetId) return NextResponse.json({ message: 'assetId is required' }, { status: 400 });

  const db = createPrismaClient();
  try {
    await processFaceTagging(assetId, db);
    return NextResponse.json({ status: 'ok', assetId });
  } finally {
    await db.$disconnect();
  }
}
