import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth';
import { prisma } from '../../../../../lib/db';

// Accepts either a single assetId (CollectionAssetPicker, adding from the collection's own page)
// or an assetIds array (the media library's multi-select bulk action, adding from the asset
// side) — same underlying membership write either way, purely additive: this only ever creates
// CollectionAsset rows, never touches Asset.collectionId (the separate match/event assignment).
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null) as { assetId?: string; assetIds?: string[] } | null;
  const assetIds = Array.isArray(body?.assetIds)
    ? body.assetIds.filter((id): id is string => typeof id === 'string')
    : (body?.assetId ? [body.assetId] : []);
  if (assetIds.length === 0) return NextResponse.json({ message: 'assetId or assetIds is required' }, { status: 400 });

  const memberships = await Promise.all(assetIds.map((assetId) =>
    prisma.collectionAsset.upsert({
      where: { collectionId_assetId: { collectionId: params.id, assetId } },
      update: {},
      create: { collectionId: params.id, assetId, addedBy: user.email },
    })
  ));

  return body?.assetIds
    ? NextResponse.json({ added: memberships.length })
    : NextResponse.json(memberships[0]);
}
