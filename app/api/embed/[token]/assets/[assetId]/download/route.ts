import { NextResponse } from 'next/server';
import { resolveEmbedAssetTarget } from '../../../../../../../lib/collections';
import { getPresignedUrl } from '../../../../../../../lib/wasabi';
import { isSameOriginEmbedRequest } from '../../../../../../../lib/embed-security';

// Embed-token equivalent of app/api/share/[token]/assets/[assetId]/download — original/full
// file, used for the embed's video fallback `src` and "view full size" from the gallery grid.
export async function GET(request: Request, props: { params: Promise<{ token: string; assetId: string }> }) {
  const { token, assetId } = await props.params;
  if (!isSameOriginEmbedRequest(request)) return NextResponse.json({ message: 'Forbidden' }, { status: 403 });

  const target = await resolveEmbedAssetTarget(token, assetId);
  if (!target) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  const url = await getPresignedUrl(target.asset.editedKey ?? target.asset.objectKey);
  return NextResponse.redirect(url, { status: 307 });
}
