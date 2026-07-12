import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';
import { REVIEWABLE_IMAGE_WHERE } from '../../../../lib/asset-review';

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '20')));

  const [assets, total] = await Promise.all([
    prisma.asset.findMany({
      where: REVIEWABLE_IMAGE_WHERE,
      orderBy: { uploadedAt: 'asc' },
      take: limit,
      select: { id: true, title: true, uploadedAt: true, manualTagsJson: true },
    }),
    prisma.asset.count({ where: REVIEWABLE_IMAGE_WHERE }),
  ]);

  const ids = assets.map((a) => a.id);
  const [playerTags, sponsorTags] = await Promise.all([
    prisma.assetPlayerTag.findMany({ where: { assetId: { in: ids }, status: 'confirmed' }, select: { assetId: true, playerId: true } }),
    prisma.assetSponsorTag.findMany({ where: { assetId: { in: ids }, status: 'confirmed' }, select: { assetId: true, sponsorId: true } }),
  ]);

  const playerIdsByAsset = new Map<string, string[]>();
  for (const t of playerTags) {
    const list = playerIdsByAsset.get(t.assetId) ?? [];
    if (!list.includes(t.playerId)) list.push(t.playerId);
    playerIdsByAsset.set(t.assetId, list);
  }
  const sponsorIdsByAsset = new Map<string, string[]>();
  for (const t of sponsorTags) {
    const list = sponsorIdsByAsset.get(t.assetId) ?? [];
    if (!list.includes(t.sponsorId)) list.push(t.sponsorId);
    sponsorIdsByAsset.set(t.assetId, list);
  }

  return NextResponse.json({
    assets: assets.map((a) => ({
      id: a.id,
      title: a.title,
      uploadedAt: a.uploadedAt,
      manualTagsJson: a.manualTagsJson,
      playerIds: playerIdsByAsset.get(a.id) ?? [],
      sponsorIds: sponsorIdsByAsset.get(a.id) ?? [],
    })),
    total,
  });
}
