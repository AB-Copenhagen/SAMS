import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';
import { REVIEWABLE_ASSET_WHERE } from '../../../../lib/asset-review';

// One-time diagnostic: after bulk-approving suggested tags on stale image assets (see the removed
// app/api/system/bulk-approve-suggested-tags route), 680 assets remained in the /review queue.
// This reports why — split by fileType and by age relative to the 3-day cutoff — so the next
// bulk-approve pass (if any) can be scoped correctly instead of guessing. Read-only. Run once,
// then delete this route.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const days = Number(new URL(request.url).searchParams.get('olderThanDays')) || 3;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [
    total,
    imagesOlder, imagesNewer,
    videosOlder, videosNewer,
    otherOlder, otherNewer,
  ] = await Promise.all([
    prisma.asset.count({ where: REVIEWABLE_ASSET_WHERE }),
    prisma.asset.count({ where: { ...REVIEWABLE_ASSET_WHERE, fileType: { startsWith: 'image/' }, uploadedAt: { lte: cutoff } } }),
    prisma.asset.count({ where: { ...REVIEWABLE_ASSET_WHERE, fileType: { startsWith: 'image/' }, uploadedAt: { gt: cutoff } } }),
    prisma.asset.count({ where: { ...REVIEWABLE_ASSET_WHERE, fileType: { startsWith: 'video/' }, uploadedAt: { lte: cutoff } } }),
    prisma.asset.count({ where: { ...REVIEWABLE_ASSET_WHERE, fileType: { startsWith: 'video/' }, uploadedAt: { gt: cutoff } } }),
    prisma.asset.count({ where: { ...REVIEWABLE_ASSET_WHERE, fileType: { not: { startsWith: 'image/' } }, NOT: { fileType: { startsWith: 'video/' } }, uploadedAt: { lte: cutoff } } }),
    prisma.asset.count({ where: { ...REVIEWABLE_ASSET_WHERE, fileType: { not: { startsWith: 'image/' } }, NOT: { fileType: { startsWith: 'video/' } }, uploadedAt: { gt: cutoff } } }),
  ]);

  const oldAssetIds = (await prisma.asset.findMany({
    where: { ...REVIEWABLE_ASSET_WHERE, uploadedAt: { lte: cutoff } },
    select: { id: true },
  })).map((a) => a.id);

  const [suggestedPlayerTags, suggestedSponsorTags] = await Promise.all([
    prisma.assetPlayerTag.count({ where: { assetId: { in: oldAssetIds }, status: 'suggested' } }),
    prisma.assetSponsorTag.count({ where: { assetId: { in: oldAssetIds }, status: 'suggested' } }),
  ]);

  return NextResponse.json({
    cutoff: cutoff.toISOString(),
    totalInQueue: total,
    olderThanCutoff: { images: imagesOlder, videos: videosOlder, other: otherOlder },
    newerThanCutoff: { images: imagesNewer, videos: videosNewer, other: otherNewer },
    remainingSuggestedTagsOnOlderAssets: { player: suggestedPlayerTags, sponsor: suggestedSponsorTags },
  });
}
