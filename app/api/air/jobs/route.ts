import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';
import { submitAirJob } from '../../../../lib/air';

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const { assetId } = await request.json() as { assetId?: string };
  if (!assetId) return NextResponse.json({ message: 'assetId required' }, { status: 400 });

  const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { objectKey: true } });
  if (!asset) return NextResponse.json({ message: 'Asset not found' }, { status: 404 });

  const jobId = await submitAirJob(asset.objectKey);

  // Store jobId so the polling route can find it
  await prisma.asset.update({
    where: { id: assetId },
    data: { wasbaiResponseJson: JSON.stringify({ jobId, status: 'queued' }) },
  });

  return NextResponse.json({ jobId });
}
