import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';

// One-shot: adds vivenu* columns to the existing Customer table, and creates the VivenuEvent
// cache table. SQLite's ADD COLUMN has no "if not exists" form, so a second run logs a
// "duplicate column" error per statement but still returns ok — safe to call more than once,
// same as the other migrate-* routes.
// Call from an authenticated ADMIN session, e.g. in the browser console on the deployed app:
//   fetch('/api/system/migrate-vivenu-fields', { method: 'POST' }).then(r => r.json()).then(console.log)
export async function POST() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const statements = [
    `ALTER TABLE "Customer" ADD COLUMN "vivenuCustomerId" TEXT`,
    `ALTER TABLE "Customer" ADD COLUMN "vivenuLifetimeSpend" REAL`,
    `ALTER TABLE "Customer" ADD COLUMN "vivenuSeasonPassStatus" TEXT`,
    `ALTER TABLE "Customer" ADD COLUMN "vivenuMatchesPurchasedCount" INTEGER`,
    `ALTER TABLE "Customer" ADD COLUMN "vivenuAttendedEventIdsJson" TEXT`,
    `ALTER TABLE "Customer" ADD COLUMN "vivenuMatchesAttendedCount" INTEGER`,
    `ALTER TABLE "Customer" ADD COLUMN "vivenuSyncedAt" DATETIME`,
    `CREATE TABLE IF NOT EXISTS "VivenuEvent" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT,
      "eventType" TEXT NOT NULL,
      "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  ];

  let applied = 0;
  for (const sql of statements) {
    try {
      await prisma.$executeRawUnsafe(sql);
      applied++;
    } catch (err) {
      console.warn(`[migrate-vivenu-fields] skipped (likely already applied): ${sql}`, err);
    }
  }

  return NextResponse.json({ ok: true, applied, total: statements.length });
}
