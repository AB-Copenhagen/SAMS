import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';

// One-shot: adds the HLS transcoding columns for gh-122 — on Asset: hlsKey (master manifest
// object key), hlsStatus, hlsAttempts, mirroring thumbnailKey/thumbnailStatus/thumbnailAttempts;
// on CronRun: hlsStillPending/hlsSkipped, mirroring thumbsStillPending/thumbsSkipped. Default
// is "skipped", not "pending": HLS only applies to new video uploads going forward (no backfill),
// so existing rows (images and already-uploaded videos alike) must not be picked up by the
// reconciliation sweep in app/api/cron/process-ingest-jobs. New video Asset rows are set to
// "pending" explicitly at creation instead. SQLite has no "ADD COLUMN IF NOT EXISTS" — each
// statement is tried independently and a "duplicate column" error (from calling this more than
// once) is reported but not fatal, same tolerance as add-scoreplay-import-fields.
//   fetch('/api/system/add-hls-columns', { method: 'POST' }).then(r => r.json()).then(console.log)
export async function POST() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const statements = [
    `ALTER TABLE "Asset" ADD COLUMN "hlsKey" TEXT`,
    `ALTER TABLE "Asset" ADD COLUMN "hlsStatus" TEXT NOT NULL DEFAULT 'skipped'`,
    `ALTER TABLE "Asset" ADD COLUMN "hlsAttempts" INTEGER NOT NULL DEFAULT 0`,
    // CronRun counters for the stale-hlsStatus reconciliation sweep (process-ingest-jobs),
    // mirroring thumbsStillPending/thumbsSkipped.
    `ALTER TABLE "CronRun" ADD COLUMN "hlsStillPending" INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE "CronRun" ADD COLUMN "hlsSkipped" INTEGER NOT NULL DEFAULT 0`,
  ];

  const results = [];
  for (const sql of statements) {
    try {
      await prisma.$executeRawUnsafe(sql);
      results.push({ sql, ok: true });
    } catch (err) {
      results.push({ sql, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ results });
}
