import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth';
import { prisma } from '../../../../../lib/db';
import { getPresignedUrl } from '../../../../../lib/wasabi';

export async function GET(_: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const asset = await prisma.asset.findUnique({ where: { id: params.id }, select: { objectKey: true, editedKey: true } });
  if (!asset) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  const url = await getPresignedUrl(asset.editedKey ?? asset.objectKey);
  return NextResponse.redirect(url, { status: 307 });
}
