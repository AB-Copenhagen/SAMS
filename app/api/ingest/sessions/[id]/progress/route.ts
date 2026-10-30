import { NextResponse } from 'next/server';
import { getIngestActor } from '../../../../../../lib/device-auth';
import { prisma } from '../../../../../../lib/db';
import { canAccessJob } from '../../../../../../lib/ingest';

// Periodic part-count report from an in-flight multipart upload. Feeds the Live ingest panel
// (which otherwise only learns partsCompleted at /complete) and bumps updatedAt, so a long but
// healthy upload is never mistaken for a stuck one by the cron sweep.
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const actor = await getIngestActor(request);
  if (!actor) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const job = await prisma.ingestJob.findUnique({ where: { id: params.id } });
  if (!job) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  if (!canAccessJob(actor, job)) return NextResponse.json({ message: 'Forbidden' }, { status: 403 });

  const body = await request.json().catch(() => null);
  const partsCompleted = Number(body?.partsCompleted);
  if (!Number.isInteger(partsCompleted) || partsCompleted < 0) {
    return NextResponse.json({ message: 'partsCompleted must be a non-negative integer' }, { status: 400 });
  }

  // Conditional so a late report can't touch a job that already completed or failed, and reports
  // arriving out of order (they're fire-and-forget from several workers) never move the count back.
  const value = job.partsTotal ? Math.min(partsCompleted, job.partsTotal) : partsCompleted;
  const { count } = await prisma.ingestJob.updateMany({
    where: { id: job.id, status: 'uploading', partsCompleted: { lt: value } },
    data: { partsCompleted: value },
  });

  return NextResponse.json({ status: count ? 'ok' : 'ignored' });
}
