import { NextResponse } from 'next/server';
import { resolveEmbedAssetTarget } from '../../../../../../../../lib/collections';
import { getPresignedUrl, fetchObjectText } from '../../../../../../../../lib/wasabi';
import { resolveHlsObjectKey } from '../../../../../../../../lib/video-hls';
import { isSameOriginEmbedRequest } from '../../../../../../../../lib/embed-security';

// Embed-token equivalent of app/api/share/[token]/assets/[assetId]/hls/[...path] (gh-122) — same
// manifest-proxy/segment-redirect split (see that route and lib/wasabi.ts's fetchObjectText for
// why), gated via resolveEmbedAssetTarget instead of resolveShareTarget. No per-request logging
// (same as the share route — manifest/segment requests happen many times per play).
export async function GET(request: Request, props: { params: Promise<{ token: string; assetId: string; path: string[] }> }) {
  const { token, assetId, path } = await props.params;
  if (!isSameOriginEmbedRequest(request)) return NextResponse.json({ message: 'Forbidden' }, { status: 403 });

  const target = await resolveEmbedAssetTarget(token, assetId);
  if (!target) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  const key = resolveHlsObjectKey(target.asset.objectKey, path);
  if (!key) return NextResponse.json({ message: 'Invalid path' }, { status: 400 });

  if (key.endsWith('.m3u8')) {
    const text = await fetchObjectText(key);
    if (text === null) return NextResponse.json({ message: 'Not found' }, { status: 404 });
    return new NextResponse(text, {
      headers: { 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'private, max-age=10' },
    });
  }

  const url = await getPresignedUrl(key);
  return NextResponse.redirect(url, {
    status: 307,
    headers: { 'Cache-Control': 'private, max-age=31536000, immutable' },
  });
}
