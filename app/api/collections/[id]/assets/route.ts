import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth';
import { prisma } from '../../../../../lib/db';

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null) as { assetId?: string } | null;
  if (!body?.assetId) return NextResponse.json({ message: 'assetId is required' }, { status: 400 });

  const membership = await prisma.collectionAsset.upsert({
    where: { collectionId_assetId: { collectionId: params.id, assetId: body.assetId } },
    update: {},
    create: { collectionId: params.id, assetId: body.assetId, addedBy: user.email },
  });
  return NextResponse.json(membership);
}
