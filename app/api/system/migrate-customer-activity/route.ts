import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';

// One-shot: creates the CustomerActivity table (per-customer chronological event log — logins,
// consent changes, segment changes, orders) if it doesn't already exist. Safe to call more than
// once. Call from an authenticated ADMIN session, e.g. in the browser console on the deployed app:
//   fetch('/api/system/migrate-customer-activity', { method: 'POST' }).then(r => r.json()).then(console.log)
export async function POST() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const statements = [
    `CREATE TABLE IF NOT EXISTS "CustomerActivity" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "customerId" TEXT NOT NULL,
      "type" TEXT NOT NULL,
      "occurredAt" DATETIME NOT NULL,
      "detail" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "CustomerActivity_customerId_type_occurredAt_key" ON "CustomerActivity"("customerId", "type", "occurredAt")`,
    `CREATE INDEX IF NOT EXISTS "CustomerActivity_customerId_occurredAt_idx" ON "CustomerActivity"("customerId", "occurredAt")`,
  ];

  for (const sql of statements) {
    await prisma.$executeRawUnsafe(sql);
  }

  return NextResponse.json({ ok: true, applied: statements.length });
}
