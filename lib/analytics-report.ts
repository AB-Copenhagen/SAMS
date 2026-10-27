// Query functions backing /analytics. Cached the same way as lib/customer-reports.ts's report
// functions — this page's stats don't need to react to a single new upload or share event
// immediately, and recomputing all 13 aggregate queries (several full Asset/ShareEvent table
// scans) on every page load was the cause of its 10-20s load time.

import { unstable_cache } from 'next/cache';
import { prisma } from './db';

export const RATINGS = [1, 2, 3, 4] as const;

export type LeaderboardRow = { label: string; count: number };

export type AnalyticsReport = {
  totalAssets: number;
  imageCount: number;
  videoCount: number;
  otherCount: number;
  totalViews: number;
  totalDownloads: number;
  uniqueViewers: number;
  uniqueDownloaders: number;
  unratedCount: number;
  ratingCounts: number[];
  uploadsByUser: LeaderboardRow[];
  reviewsByUser: LeaderboardRow[];
  viewsByCollection: LeaderboardRow[];
  downloadsByAsset: LeaderboardRow[];
};

async function getAnalyticsUncached(): Promise<AnalyticsReport> {
  const [
    imageCount,
    videoCount,
    otherCount,
    uploadsByUser,
    reviewsByUser,
    unratedCount,
    ratingCounts,
    totalViews,
    totalDownloads,
    uniqueViewers,
    uniqueDownloaders,
    viewsByCollection,
    downloadsByAsset,
  ] = await Promise.all([
    prisma.asset.count({ where: { fileType: { startsWith: 'image/' } } }),
    prisma.asset.count({ where: { fileType: { startsWith: 'video/' } } }),
    prisma.asset.count({ where: { NOT: [{ fileType: { startsWith: 'image/' } }, { fileType: { startsWith: 'video/' } }] } }),
    prisma.asset.groupBy({
      by: ['uploaderEmail'],
      _count: { uploaderEmail: true },
      orderBy: { _count: { uploaderEmail: 'desc' } },
      take: 15,
    }),
    prisma.asset.groupBy({
      by: ['reviewedBy'],
      where: { reviewedBy: { not: null } },
      _count: { reviewedBy: true },
      orderBy: { _count: { reviewedBy: 'desc' } },
      take: 15,
    }),
    prisma.asset.count({ where: { rating: null } }),
    Promise.all(RATINGS.map((n) => prisma.asset.count({ where: { rating: n } }))),
    prisma.shareEvent.count({ where: { kind: 'view' } }),
    prisma.shareEvent.count({ where: { kind: 'download' } }),
    prisma.shareEvent.groupBy({ by: ['ipHash'], where: { kind: 'view', ipHash: { not: null } } }).then((r) => r.length),
    prisma.shareEvent.groupBy({ by: ['ipHash'], where: { kind: 'download', ipHash: { not: null } } }).then((r) => r.length),
    prisma.shareEvent.groupBy({
      by: ['collectionId'],
      where: { kind: 'view', collectionId: { not: null } },
      _count: { collectionId: true },
      orderBy: { _count: { collectionId: 'desc' } },
      take: 10,
    }),
    prisma.shareEvent.groupBy({
      by: ['assetId'],
      where: { kind: 'download', assetId: { not: null } },
      _count: { assetId: true },
      orderBy: { _count: { assetId: 'desc' } },
      take: 10,
    }),
  ]);

  const [collectionNames, assetTitles] = await Promise.all([
    prisma.collection.findMany({
      where: { id: { in: viewsByCollection.map((v) => v.collectionId as string) } },
      select: { id: true, name: true },
    }),
    prisma.asset.findMany({
      where: { id: { in: downloadsByAsset.map((d) => d.assetId as string) } },
      select: { id: true, title: true, eventName: true },
    }),
  ]);
  const collectionNameById = new Map(collectionNames.map((c) => [c.id, c.name]));
  const assetTitleById = new Map(assetTitles.map((a) => [a.id, a.title || a.eventName || 'Untitled']));

  return {
    totalAssets: imageCount + videoCount + otherCount,
    imageCount,
    videoCount,
    otherCount,
    totalViews,
    totalDownloads,
    uniqueViewers,
    uniqueDownloaders,
    unratedCount,
    ratingCounts,
    uploadsByUser: uploadsByUser.map((u) => ({ label: u.uploaderEmail, count: u._count.uploaderEmail })),
    reviewsByUser: reviewsByUser.map((r) => ({ label: r.reviewedBy as string, count: r._count.reviewedBy })),
    viewsByCollection: viewsByCollection.map((v) => ({
      label: collectionNameById.get(v.collectionId as string) || 'Deleted collection',
      count: v._count.collectionId,
    })),
    downloadsByAsset: downloadsByAsset.map((d) => ({
      label: assetTitleById.get(d.assetId as string) || 'Deleted asset',
      count: d._count.assetId,
    })),
  };
}

export const getCachedAnalytics = unstable_cache(getAnalyticsUncached, ['analytics-report'], { revalidate: 300 });
