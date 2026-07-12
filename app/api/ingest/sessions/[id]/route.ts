import { NextResponse } from 'next/server';
import { getIngestActor } from '../../../../../lib/device-auth';
import { prisma } from '../../../../../lib/db';
import { listParts } from '../../../../../lib/wasabi';
import { canAccessJob } from '../../../../../lib/ingest';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const actor = await getIngestActor(request);
  if (!actor) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const job = await prisma.ingestJob.findUnique({ where: { id: params.id } });
  if (!job) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  if (!canAccessJob(actor, job)) return NextResponse.json({ message: 'Forbidden' }, { status: 403 });

  let uploadedParts: { partNumber: number; eTag: string }[] = [];
  if (job.status === 'uploading' && job.uploadId) {
    uploadedParts = await listParts(job.objectKey, job.uploadId);
  }

  return NextResponse.json({ job, uploadedParts });
}
