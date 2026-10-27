import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';

// One-shot: adds the indexes backing /analytics (lib/analytics-report.ts), which otherwise ran
// several full Asset/ShareEvent table scans (fileType, uploaderEmail, reviewedBy, rating, ipHash
// had no index) on every page load. Safe to call more than once — CREATE INDEX IF NOT EXISTS.
//   fetch('/api/system/add-analytics-indexes', { method: 'POST' }).then(r => r.json()).then(console.log)
export async function POST() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const statements = [
    `CREATE INDEX IF NOT EXISTS "Asset_fileType_idx" ON "Asset"("fileType")`,
    `CREATE INDEX IF NOT EXISTS "Asset_uploaderEmail_idx" ON "Asset"("uploaderEmail")`,
    `CREATE INDEX IF NOT EXISTS "Asset_reviewedBy_idx" ON "Asset"("reviewedBy")`,
    `CREATE INDEX IF NOT EXISTS "Asset_rating_idx" ON "Asset"("rating")`,
    `CREATE INDEX IF NOT EXISTS "ShareEvent_kind_ipHash_idx" ON "ShareEvent"("kind", "ipHash")`,
  ];

  for (const sql of statements) {
    await prisma.$executeRawUnsafe(sql);
  }

  return NextResponse.json({ ok: true, applied: statements.length });
}
