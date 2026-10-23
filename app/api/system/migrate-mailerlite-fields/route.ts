import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';

// One-shot: adds mailerlite* columns to the existing Customer table. SQLite's ADD COLUMN has
// no "if not exists" form, so a second run logs a "duplicate column" error per statement but
// still returns ok — safe to call more than once, same as the other migrate-* routes.
// Call from an authenticated ADMIN session, e.g. in the browser console on the deployed app:
//   fetch('/api/system/migrate-mailerlite-fields', { method: 'POST' }).then(r => r.json()).then(console.log)
export async function POST() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const statements = [
    `ALTER TABLE "Customer" ADD COLUMN "mailerliteSubscriberId" TEXT`,
    `ALTER TABLE "Customer" ADD COLUMN "mailerliteStatus" TEXT`,
    `ALTER TABLE "Customer" ADD COLUMN "mailerliteGroupsJson" TEXT`,
    `ALTER TABLE "Customer" ADD COLUMN "mailerliteSentCount" INTEGER`,
    `ALTER TABLE "Customer" ADD COLUMN "mailerliteOpensCount" INTEGER`,
    `ALTER TABLE "Customer" ADD COLUMN "mailerliteOpenRate" REAL`,
    `ALTER TABLE "Customer" ADD COLUMN "mailerliteSyncedAt" DATETIME`,
  ];

  let applied = 0;
  for (const sql of statements) {
    try {
      await prisma.$executeRawUnsafe(sql);
      applied++;
    } catch (err) {
      console.warn(`[migrate-mailerlite-fields] skipped (likely already applied): ${sql}`, err);
    }
  }

  return NextResponse.json({ ok: true, applied, total: statements.length });
}
