import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth';
import { prisma } from '../../../../../lib/db';

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null) as { playerId?: string; sponsorId?: string } | null;
  if (!body?.playerId && !body?.sponsorId) {
    return NextResponse.json({ message: 'playerId or sponsorId is required' }, { status: 400 });
  }

  if (body.playerId) {
    const rule = await prisma.collectionPlayerRule.upsert({
      where: { collectionId_playerId: { collectionId: params.id, playerId: body.playerId } },
      update: {},
      create: { collectionId: params.id, playerId: body.playerId },
    });
    return NextResponse.json(rule);
  }

  const rule = await prisma.collectionSponsorRule.upsert({
    where: { collectionId_sponsorId: { collectionId: params.id, sponsorId: body.sponsorId! } },
    update: {},
    create: { collectionId: params.id, sponsorId: body.sponsorId! },
  });
  return NextResponse.json(rule);
}
