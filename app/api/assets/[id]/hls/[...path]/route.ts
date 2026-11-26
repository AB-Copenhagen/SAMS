import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../../../lib/auth';
import { prisma } from '../../../../../../lib/db';
import { getPresignedUrl, fetchObjectText } from '../../../../../../lib/wasabi';
import { resolveHlsObjectKey } from '../../../../../../lib/video-hls';

// Serves the HLS manifests/segments lib/video-hls.ts wrote to Wasabi under hls/{objectKey}/ —
// staff-authenticated equivalent of the share-token route at
// app/api/share/[token]/assets/[assetId]/hls/[...path]. See that route's comment, and
// lib/wasabi.ts's fetchObjectText, for why manifests are proxied (not redirected) while segments
// are redirected (not proxied).
export async function GET(_: Request, props: { params: Promise<{ id: string; path: string[] }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const asset = await prisma.asset.findUnique({ where: { id: params.id }, select: { objectKey: true } });
  if (!asset) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  const key = resolveHlsObjectKey(asset.objectKey, params.path);
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
