import { NextResponse } from 'next/server';
import { resolveEmbedAssetTarget } from '../../../../../../../lib/collections';
import { getPresignedUrl } from '../../../../../../../lib/wasabi';
import { ensureWebPreviewKey } from '../../../../../../../lib/export-presets';
import { isSameOriginEmbedRequest } from '../../../../../../../lib/embed-security';

export const maxDuration = 60;

// Embed-token equivalent of app/api/share/[token]/assets/[assetId]/preview — cached 1920px
// preview for inline image display (the single-image embed, and the gallery grid's lightbox).
export async function GET(request: Request, props: { params: Promise<{ token: string; assetId: string }> }) {
  const { token, assetId } = await props.params;
  if (!isSameOriginEmbedRequest(request)) return NextResponse.json({ message: 'Forbidden' }, { status: 403 });

  const target = await resolveEmbedAssetTarget(token, assetId);
  if (!target) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  const key = await ensureWebPreviewKey(target.asset);
  const url = await getPresignedUrl(key);
  return NextResponse.redirect(url, {
    status: 307,
    headers: { 'Cache-Control': 'private, max-age=3300' },
  });
}
