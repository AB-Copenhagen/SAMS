import { NextResponse } from 'next/server';
import { getCurrentUser, hasPermission } from '../../../../../lib/auth';
import { addPlaylistItem, removePlaylistItem, reorderPlaylistItems } from '../../../../../lib/playlists';

// addPlaylistItem throws a descriptive Error for the three rejectable cases (lib/playlists.ts) —
// mapped here to the matching HTTP status, same split as collectionEmbeddable's check living in
// the route rather than the resolver.
function statusForAddError(message: string): number {
  if (message === 'Asset not found') return 404;
  if (message === 'Asset is already in this playlist') return 409;
  return 400; // "Only video assets can be added to a playlist"
}

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, 'media', 'edit')) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const assetId = typeof (body as { assetId?: unknown }).assetId === 'string' ? (body as { assetId: string }).assetId : '';
  if (!assetId) return NextResponse.json({ message: 'assetId is required' }, { status: 400 });

  try {
    const item = await addPlaylistItem(params.id, assetId, user.email);
    return NextResponse.json(item);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Request failed';
    return NextResponse.json({ message }, { status: statusForAddError(message) });
  }
}

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, 'media', 'edit')) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const assetId = searchParams.get('assetId');
  if (!assetId) return NextResponse.json({ message: 'assetId is required' }, { status: 400 });

  await removePlaylistItem(params.id, assetId);
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, 'media', 'edit')) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const orderedAssetIds = (body as { orderedAssetIds?: unknown }).orderedAssetIds;
  if (!Array.isArray(orderedAssetIds) || orderedAssetIds.some((id) => typeof id !== 'string')) {
    return NextResponse.json({ message: 'orderedAssetIds must be an array of asset ids' }, { status: 400 });
  }

  await reorderPlaylistItems(params.id, orderedAssetIds as string[]);
  return NextResponse.json({ ok: true });
}
