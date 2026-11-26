import { NextResponse } from 'next/server';
import { resolveShareTarget } from '../../../../../../../../lib/collections';
import { getPresignedUrl, fetchObjectText } from '../../../../../../../../lib/wasabi';
import { resolveHlsObjectKey } from '../../../../../../../../lib/video-hls';

// Share-token equivalent of app/api/assets/[id]/hls/[...path] — same manifest-proxy /
// segment-redirect split (see that route and lib/wasabi.ts's fetchObjectText for why). No
// per-request share-event logging here, matching the `preview` route (inline viewing, requested
// many times per play) rather than `download` (one explicit action, logged once).
export async function GET(_: Request, props: { params: Promise<{ token: string; assetId: string; path: string[] }> }) {
  const { token, assetId, path } = await props.params;

  const target = await resolveShareTarget(token, assetId);
  if (!target) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  if (target.kind === 'password-required') return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

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
