import { NextResponse } from 'next/server';
import { resolveShareTarget } from '../../../../../../../lib/collections';
import { getPresignedUrl } from '../../../../../../../lib/wasabi';
import { ensureThumbnailKey } from '../../../../../../../lib/thumbnail';

export const maxDuration = 60;

export async function GET(_: Request, props: { params: Promise<{ token: string; assetId: string }> }) {
  const { token, assetId } = await props.params;

  const target = await resolveShareTarget(token, assetId);
  if (!target) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  if (target.kind === 'password-required') return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const thumbnailKey = await ensureThumbnailKey(target.asset);
  const url = await getPresignedUrl(thumbnailKey);
  return NextResponse.redirect(url, {
    status: 307,
    headers: { 'Cache-Control': 'private, max-age=3300' },
  });
}
