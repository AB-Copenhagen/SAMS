import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';

// One-shot: adds vivenuPurchasedEventIdsJson to the existing Customer table (see
// prisma/schema.prisma) — same ADD COLUMN pattern as migrate-vivenu-fields, safe to call more
// than once.
// Call from an authenticated ADMIN session, e.g. in the browser console on the deployed app:
//   fetch('/api/system/migrate-vivenu-purchased-events', { method: 'POST' }).then(r => r.json()).then(console.log)
export async function POST() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const statements = [
    `ALTER TABLE "Customer" ADD COLUMN "vivenuPurchasedEventIdsJson" TEXT`,
  ];

  let applied = 0;
  for (const sql of statements) {
    try {
      await prisma.$executeRawUnsafe(sql);
      applied++;
    } catch (err) {
      console.warn(`[migrate-vivenu-purchased-events] skipped (likely already applied): ${sql}`, err);
    }
  }

  return NextResponse.json({ ok: true, applied, total: statements.length });
}
