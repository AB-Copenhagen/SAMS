import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth';
import { prisma } from '../../../../../lib/db';
import { getPresignedUrl } from '../../../../../lib/wasabi';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const asset = await prisma.asset.findUnique({ where: { id: params.id }, select: { objectKey: true } });
  if (!asset) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  const url = await getPresignedUrl(asset.objectKey, 3600);
  return NextResponse.redirect(url, { status: 307 });
}
