// Shared "eligible for the fast review queue" condition — must stay identical between the
// queue API's returned `total` (app/api/assets/review-queue/route.ts) and its own count query, or
// the two will drift out of sync. faceTagStatus also gates sponsor-OCR in the cron
// (app/api/cron/process-ingest-jobs/route.ts), so waiting on it covers both player and sponsor
// detection settling before an asset is worth a human review pass. Video is included: its
// faceTagStatus is set to 'skipped' at ingest (no Rekognition Video support) and never changes,
// so { not: 'pending' } already matches it — no AI tags to wait on, just manual review.
export const REVIEWABLE_ASSET_WHERE = {
  reviewedAt: null,
  faceTagStatus: { not: 'pending' },
} as const;
