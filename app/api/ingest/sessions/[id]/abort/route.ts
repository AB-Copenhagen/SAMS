import { NextResponse } from 'next/server';
import { getIngestActor } from '../../../../../../lib/device-auth';
import { prisma } from '../../../../../../lib/db';
import { abortMultipartUpload } from '../../../../../../lib/wasabi';
import { canAccessJob } from '../../../../../../lib/ingest';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const actor = await getIngestActor(request);
  if (!actor) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const job = await prisma.ingestJob.findUnique({ where: { id: params.id } });
  if (!job) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  if (!canAccessJob(actor, job)) return NextResponse.json({ message: 'Forbidden' }, { status: 403 });

  if (job.uploadId) {
    await abortMultipartUpload(job.objectKey, job.uploadId).catch((err) => {
      console.error('[ingest/abort] abortMultipartUpload failed:', err);
    });
  }

  await prisma.ingestJob.update({ where: { id: job.id }, data: { status: 'aborted' } });
  return NextResponse.json({ status: 'ok' });
}
