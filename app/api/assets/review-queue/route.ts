import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';
import { REVIEWABLE_ASSET_WHERE } from '../../../../lib/asset-review';

// POST (not GET) because excludeIds — every asset id the client has already loaded this session —
// can grow into the hundreds and needs a body, not a query string.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const limit = Math.min(50, Math.max(1, parseInt(body?.limit) || 20));
  const excludeIds: string[] = Array.isArray(body?.excludeIds) ? body.excludeIds : [];

  // The review workflow keeps every fetched asset locally (even after rating it) so a reviewer
  // can go Back and revisit it, and rating is fire-and-forget for a snappy UI — so this endpoint
  // can get called again before an earlier PATCH's reviewedAt write has actually committed.
  // Relying on REVIEWABLE_ASSET_WHERE alone would then re-return the same still-technically-
  // unreviewed assets, which the client (correctly) treats as already-seen and drops, starving
  // the queue. Explicitly excluding every id the client has already loaded makes each page
  // advance regardless of that race.
  const where = excludeIds.length > 0
    ? { ...REVIEWABLE_ASSET_WHERE, id: { notIn: excludeIds } }
    : REVIEWABLE_ASSET_WHERE;

  const [assets, total] = await Promise.all([
    prisma.asset.findMany({
      where,
      orderBy: { uploadedAt: 'asc' },
      take: limit,
      select: { id: true, title: true, uploadedAt: true, manualTagsJson: true, fileType: true, thumbnailKey: true, thumbnailStatus: true },
    }),
    prisma.asset.count({ where: REVIEWABLE_ASSET_WHERE }),
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
      fileType: a.fileType,
      thumbnailKey: a.thumbnailKey,
      thumbnailStatus: a.thumbnailStatus,
      playerIds: playerIdsByAsset.get(a.id) ?? [],
      sponsorIds: sponsorIdsByAsset.get(a.id) ?? [],
    })),
    total,
  });
}
