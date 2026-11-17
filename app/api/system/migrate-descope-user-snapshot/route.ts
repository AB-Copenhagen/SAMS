import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';

// One-shot: creates the DescopeUserSnapshot table (daily total/added/lost Descope user counts,
// see gh-113) if it doesn't already exist. Safe to call more than once.
// Call from an authenticated ADMIN session, e.g. in the browser console on the deployed app:
//   fetch('/api/system/migrate-descope-user-snapshot', { method: 'POST' }).then(r => r.json()).then(console.log)
export async function POST() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const statements = [
    `CREATE TABLE IF NOT EXISTS "DescopeUserSnapshot" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "date" DATETIME NOT NULL,
      "totalCount" INTEGER,
      "addedCount" INTEGER,
      "lostCount" INTEGER,
      "idsJson" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "DescopeUserSnapshot_date_key" ON "DescopeUserSnapshot"("date")`,
  ];

  for (const sql of statements) {
    await prisma.$executeRawUnsafe(sql);
  }

  return NextResponse.json({ ok: true, applied: statements.length });
}
