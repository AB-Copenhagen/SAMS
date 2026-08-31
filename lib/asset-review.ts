import { unstable_cache, revalidateTag } from 'next/cache';
import { prisma } from './db';

// Shared "eligible for the fast review queue" condition — must stay identical between the nav
// badge count (components/AppShell.tsx) and the queue API (app/api/assets/review-queue/route.ts)
// or the two will drift out of sync. faceTagStatus also gates sponsor-OCR in the cron
// (app/api/cron/process-ingest-jobs/route.ts), so waiting on it covers both player and sponsor
// detection settling before an asset is worth a human review pass. Video is included: its
// faceTagStatus is set to 'skipped' at ingest (no Rekognition Video support) and never changes,
// so { not: 'pending' } already matches it — no AI tags to wait on, just manual review.
export const REVIEWABLE_ASSET_WHERE = {
  reviewedAt: null,
  faceTagStatus: { not: 'pending' },
} as const;

// AppShell renders this count on every page in the app, so an uncached query here means one
// full-table read per navigation. 20s is a short enough TTL that the nav badge never looks stuck,
// but the review action below still invalidates immediately so a reviewer sees the count drop as
// they work through the queue instead of waiting out the TTL.
export const getCachedUnreviewedCount = unstable_cache(
  () => prisma.asset.count({ where: REVIEWABLE_ASSET_WHERE }),
  ['review-queue-count'],
  { tags: ['review-queue-count'], revalidate: 20 },
);

export function invalidateUnreviewedCount(): void {
  revalidateTag('review-queue-count', { expire: 20 });
}
