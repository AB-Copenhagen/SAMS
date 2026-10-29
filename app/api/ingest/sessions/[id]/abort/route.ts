import { NextResponse } from 'next/server';
import { getIngestActor } from '../../../../../../lib/device-auth';
import { prisma } from '../../../../../../lib/db';
import { abortMultipartUpload } from '../../../../../../lib/wasabi';
import { canAccessJob } from '../../../../../../lib/ingest';

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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

  // A client that gives up after exhausting retries passes { error } so the job shows as failed
  // (with the reason) in Live ingest; a deliberate cancel sends no body and stays 'aborted'.
  const body = await request.json().catch(() => null);
  const error = typeof body?.error === 'string' ? body.error.slice(0, 500) : null;

  await prisma.ingestJob.update({
    where: { id: job.id },
    data: error ? { status: 'failed', errorMessage: error } : { status: 'aborted' },
  });
  return NextResponse.json({ status: 'ok' });
}
