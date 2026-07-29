import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../../../lib/auth';
import { prisma } from '../../../../../../lib/db';

export async function DELETE(_: Request, props: { params: Promise<{ id: string; assetId: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  await prisma.collectionAsset.deleteMany({ where: { collectionId: params.id, assetId: params.assetId } });
  return NextResponse.json({ success: true });
}
