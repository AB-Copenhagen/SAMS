import { NextResponse } from 'next/server';
import { verifyQstashSignature } from '../../../../lib/qstash';
import { createPrismaClient } from '../../../../lib/db';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

type QstashFailurePayload = {
  url: string;
  sourceBody: string; // base64-encoded original request body, e.g. '{"assetId":"..."}'
};

// QStash's failureCallback target (configured in lib/qstash.ts's publishJob) — called once a job
// has exhausted all its retries. Marks the asset's status 'failed' for whichever job type it was,
// mirroring what the old cron's max-attempts branch used to do, just driven by QStash's own retry
// exhaustion instead of a hand-rolled attempt counter.
export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!(await verifyQstashSignature(request, rawBody))) {
    return NextResponse.json({ message: 'Invalid signature' }, { status: 401 });
  }

  const payload = JSON.parse(rawBody) as QstashFailurePayload;
  const { assetId } = JSON.parse(Buffer.from(payload.sourceBody, 'base64').toString('utf-8')) as { assetId: string };
  if (!assetId) return NextResponse.json({ message: 'assetId missing from source body' }, { status: 400 });

  const db = createPrismaClient();
  try {
    if (payload.url.endsWith('/api/jobs/tag-asset')) {
      await db.asset.update({ where: { id: assetId }, data: { faceTagStatus: 'failed' } });
    } else if (payload.url.endsWith('/api/jobs/generate-thumbnail')) {
      await db.asset.update({ where: { id: assetId }, data: { thumbnailStatus: 'failed' } });
    }
    return NextResponse.json({ status: 'ok' });
  } finally {
    await db.$disconnect();
  }
}
