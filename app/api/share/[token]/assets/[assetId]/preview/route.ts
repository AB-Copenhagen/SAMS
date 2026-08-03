import { NextResponse } from 'next/server';
import { resolveShareTarget } from '../../../../../../../lib/collections';
import { getPresignedUrl } from '../../../../../../../lib/wasabi';
import { ensureWebPreviewKey } from '../../../../../../../lib/export-presets';

export const maxDuration = 60;

// Cached, redirect-based 1920px preview for the lightbox — /export always live-renders (a
// multi-second sharp resize of the full original) and forces a download via Content-Disposition
// for the explicit "Download as…" links, neither of which is right for something every visitor
// loads inline just to look at the photo. ensureWebPreviewKey persists the render once so every
// request after the first is a simple presigned redirect. Non-image assets (video) fall back to
// the original — this route should only ever be requested for images.
export async function GET(_: Request, props: { params: Promise<{ token: string; assetId: string }> }) {
  const { token, assetId } = await props.params;

  const target = await resolveShareTarget(token, assetId);
  if (!target) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  if (target.kind === 'password-required') return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const key = await ensureWebPreviewKey(target.asset);
  const url = await getPresignedUrl(key);
  return NextResponse.redirect(url, {
    status: 307,
    headers: { 'Cache-Control': 'private, max-age=3300' },
  });
}
