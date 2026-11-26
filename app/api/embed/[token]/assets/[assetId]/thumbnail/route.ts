import { NextResponse } from 'next/server';
import { resolveEmbedAssetTarget } from '../../../../../../../lib/collections';
import { getPresignedUrl } from '../../../../../../../lib/wasabi';
import { ensureThumbnailKey } from '../../../../../../../lib/thumbnail';
import { isSameOriginEmbedRequest } from '../../../../../../../lib/embed-security';

export const maxDuration = 60;

// Embed-token equivalent of app/api/share/[token]/assets/[assetId]/thumbnail — gallery grid thumbnails.
export async function GET(request: Request, props: { params: Promise<{ token: string; assetId: string }> }) {
  const { token, assetId } = await props.params;
  if (!isSameOriginEmbedRequest(request)) return NextResponse.json({ message: 'Forbidden' }, { status: 403 });

  const target = await resolveEmbedAssetTarget(token, assetId);
  if (!target) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  const thumbnailKey = await ensureThumbnailKey(target.asset);
  const url = await getPresignedUrl(thumbnailKey);
  return NextResponse.redirect(url, {
    status: 307,
    headers: { 'Cache-Control': 'private, max-age=3300' },
  });
}
