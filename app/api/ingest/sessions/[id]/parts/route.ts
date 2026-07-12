import { NextResponse } from 'next/server';
import { getIngestActor } from '../../../../../../lib/device-auth';
import { prisma } from '../../../../../../lib/db';
import { presignUploadPart } from '../../../../../../lib/wasabi';
import { canAccessJob } from '../../../../../../lib/ingest';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const actor = await getIngestActor(request);
  if (!actor) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const job = await prisma.ingestJob.findUnique({ where: { id: params.id } });
  if (!job) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  if (!canAccessJob(actor, job)) return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  if (!job.uploadId) return NextResponse.json({ message: 'This job is not a multipart upload' }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const partNumbers = (searchParams.get('partNumbers') || '')
    .split(',')
    .map((n) => parseInt(n.trim(), 10))
    .filter((n) => Number.isInteger(n) && n > 0);

  if (!partNumbers.length) {
    return NextResponse.json({ message: 'partNumbers query param is required, e.g. ?partNumbers=1,2,3' }, { status: 400 });
  }

  const urls = await Promise.all(
    partNumbers.map(async (partNumber) => ({
      partNumber,
      url: await presignUploadPart(job.objectKey, job.uploadId!, partNumber),
    })),
  );

  return NextResponse.json({ urls });
}
