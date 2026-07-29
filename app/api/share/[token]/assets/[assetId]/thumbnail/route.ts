import { NextResponse } from 'next/server';
import { applyShareFilters, getPublicCollectionByToken, resolveCollectionAssets } from '../../../../../../../lib/collections';
import { isShareUnlocked } from '../../../../../../../lib/share-auth';
import { getPresignedUrl } from '../../../../../../../lib/wasabi';

export async function GET(_: Request, props: { params: Promise<{ token: string; assetId: string }> }) {
  const { token, assetId } = await props.params;

  const collection = await getPublicCollectionByToken(token);
  if (!collection || !collection.isPublic) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  if (collection.sharePasswordHash && !(await isShareUnlocked(token))) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const assets = applyShareFilters(await resolveCollectionAssets(collection), collection);
  const asset = assets.find((a) => a.id === assetId);
  if (!asset) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  const url = await getPresignedUrl(asset.thumbnailKey ?? asset.objectKey);
  return NextResponse.redirect(url, {
    status: 307,
    headers: { 'Cache-Control': 'private, max-age=3300' },
  });
}
