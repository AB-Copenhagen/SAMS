import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';

// One-shot: adds the index backing REVIEWABLE_ASSET_WHERE (lib/asset-review.ts). That query —
// WHERE reviewedAt IS NULL AND faceTagStatus != 'pending' — runs on every page load via the
// AppShell nav badge (now cached, see getCachedUnreviewedCount, but still a full table scan on
// every cache miss without this). Safe to call more than once — CREATE INDEX IF NOT EXISTS.
//   fetch('/api/system/add-review-queue-index', { method: 'POST' }).then(r => r.json()).then(console.log)
export async function POST() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Asset_reviewedAt_faceTagStatus_idx" ON "Asset"("reviewedAt", "faceTagStatus")`,
  );

  return NextResponse.json({ ok: true });
}
