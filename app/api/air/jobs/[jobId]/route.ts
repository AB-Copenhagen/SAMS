import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth';
import { prisma } from '../../../../../lib/db';
import { getAirJob } from '../../../../../lib/air';
import { enrichFromAirResult } from '../../../../../lib/air-enrichment';

export async function GET(
  request: Request,
  { params }: { params: { jobId: string } },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const assetId = searchParams.get('assetId');
  if (!assetId) return NextResponse.json({ message: 'assetId required' }, { status: 400 });

  const job = await getAirJob(params.jobId);

  if (job.status === 'completed' && job.result) {
    const enriched = await enrichFromAirResult(assetId, job.result);
    return NextResponse.json({
      status: 'completed',
      tags:        enriched.tags,
      description: enriched.description,
      players:     enriched.playerNames,
      sponsors:    enriched.sponsorNames,
    });
  }

  if (job.status === 'failed') {
    return NextResponse.json({ status: 'failed', error: job.error ?? 'AIR job failed' }, { status: 502 });
  }

  return NextResponse.json({ status: job.status });
}
