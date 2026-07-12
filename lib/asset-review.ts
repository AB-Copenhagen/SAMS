// Shared "eligible for the fast review queue" condition — must stay identical between the nav
// badge count (components/AppShell.tsx) and the queue API (app/api/assets/review-queue/route.ts)
// or the two will drift out of sync. faceTagStatus also gates sponsor-OCR in the cron
// (app/api/cron/process-ingest-jobs/route.ts), so waiting on it covers both player and sponsor
// detection settling before an asset is worth a human review pass.
export const REVIEWABLE_IMAGE_WHERE = {
  fileType: { startsWith: 'image/' },
  reviewedAt: null,
  faceTagStatus: { not: 'pending' },
} as const;
