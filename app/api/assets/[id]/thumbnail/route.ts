import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth';
import { prisma } from '../../../../../lib/db';
import { getPresignedUrl } from '../../../../../lib/wasabi';
import { ensureThumbnailKey } from '../../../../../lib/thumbnail';

export const maxDuration = 60;

export async function GET(_: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const asset = await prisma.asset.findUnique({
    where: { id: params.id },
    select: { id: true, objectKey: true, thumbnailKey: true, fileType: true },
  });
  if (!asset) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  const thumbnailKey = await ensureThumbnailKey(asset);
  const url = await getPresignedUrl(thumbnailKey);
  // getPresignedUrl's Redis cache always evicts >= 1h before the signed URL itself
  // expires, so this redirect is safe to let the browser cache for up to that long
  return NextResponse.redirect(url, {
    status: 307,
    headers: { 'Cache-Control': 'private, max-age=3300' },
  });
}
