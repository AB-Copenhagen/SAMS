import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';
import { analyzeWithGcv } from '../../../../lib/gcv';
import { enrichFromGcvResult } from '../../../../lib/gcv-enrichment';

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const body = await request.json() as { assetId?: string };
  if (!body.assetId) return NextResponse.json({ message: 'assetId required' }, { status: 400 });

  const asset = await prisma.asset.findUnique({
    where:  { id: body.assetId },
    select: { objectKey: true, fileType: true },
  });
  if (!asset) return NextResponse.json({ message: 'Asset not found' }, { status: 404 });

  if (!asset.fileType.startsWith('image/')) {
    return NextResponse.json({ message: 'GCV analysis is only supported for images' }, { status: 422 });
  }

  try {
    const gcvResult = await analyzeWithGcv(asset.objectKey);
    const enriched  = await enrichFromGcvResult(body.assetId, gcvResult);

    return NextResponse.json({
      tags:         enriched.tags,
      aiDescription: enriched.aiDescription,
      players:      enriched.playerNames,
      sponsors:     enriched.sponsorNames,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'GCV analysis failed';
    console.error('[gcv/analyze]', message);
    return NextResponse.json({ message }, { status: 502 });
  }
}
