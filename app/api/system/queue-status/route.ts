import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';

// The Jobs page polls this every 30s per open tab, and each call fans out into 10 separate
// queries. Caching the whole result for a few seconds means a burst of polls (multiple admins,
// or a page reload) shares one set of DB round trips instead of repeating all 10 every time —
// staleness this short is invisible against a 30s poll interval.
const getCachedQueueStatus = unstable_cache(
  async () => {
    const [
      facePending, faceDone, faceFailed, faceSkipped,
      thumbPending, thumbDone, thumbFailed, thumbSkipped,
      pendingAssets, failedAssets,
    ] = await Promise.all([
      prisma.asset.count({ where: { faceTagStatus: 'pending' } }),
      prisma.asset.count({ where: { faceTagStatus: 'done' } }),
      prisma.asset.count({ where: { faceTagStatus: 'failed' } }),
      prisma.asset.count({ where: { faceTagStatus: 'skipped' } }),
      prisma.asset.count({ where: { thumbnailStatus: 'pending' } }),
      prisma.asset.count({ where: { thumbnailStatus: 'done' } }),
      prisma.asset.count({ where: { thumbnailStatus: 'failed' } }),
      prisma.asset.count({ where: { thumbnailStatus: 'skipped' } }),
      prisma.asset.findMany({
        where: { faceTagStatus: 'pending' },
        orderBy: { uploadedAt: 'asc' },
        take: 10,
        select: { id: true, title: true, objectKey: true, uploadedAt: true, faceTagAttempts: true },
      }),
      prisma.asset.findMany({
        where: { faceTagStatus: 'failed' },
        orderBy: { uploadedAt: 'desc' },
        take: 10,
        select: { id: true, title: true, objectKey: true, uploadedAt: true, faceTagAttempts: true },
      }),
    ]);

    return {
      faceTagging: { pending: facePending, done: faceDone, failed: faceFailed, skipped: faceSkipped },
      thumbnails: { pending: thumbPending, done: thumbDone, failed: thumbFailed, skipped: thumbSkipped },
      pendingAssets,
      failedAssets,
    };
  },
  ['queue-status'],
  { revalidate: 8 },
);

export async function GET() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  return NextResponse.json(await getCachedQueueStatus());
}
