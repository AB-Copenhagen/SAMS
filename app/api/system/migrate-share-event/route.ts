import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';

// One-shot: creates the ShareEvent table (analytics tracking for public gallery views/downloads)
// if it doesn't already exist. Safe to call more than once — every statement is idempotent.
// Call from an authenticated ADMIN session, e.g. in the browser console on the deployed app:
//   fetch('/api/system/migrate-share-event', { method: 'POST' }).then(r => r.json()).then(console.log)
export async function POST() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const statements = [
    `CREATE TABLE IF NOT EXISTS "ShareEvent" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "kind" TEXT NOT NULL,
      "token" TEXT NOT NULL,
      "collectionId" TEXT,
      "assetId" TEXT,
      "ipHash" TEXT,
      "userAgent" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS "ShareEvent_kind_createdAt_idx" ON "ShareEvent"("kind", "createdAt")`,
    `CREATE INDEX IF NOT EXISTS "ShareEvent_kind_collectionId_idx" ON "ShareEvent"("kind", "collectionId")`,
    `CREATE INDEX IF NOT EXISTS "ShareEvent_kind_assetId_idx" ON "ShareEvent"("kind", "assetId")`,
  ];

  for (const sql of statements) {
    await prisma.$executeRawUnsafe(sql);
  }

  return NextResponse.json({ ok: true, applied: statements.length });
}
