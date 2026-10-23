import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';

// One-shot: creates the Customer and CustomerSyncRun tables (see prisma/schema.prisma) if they
// don't already exist. Safe to call more than once — every statement is idempotent.
// Call from an authenticated ADMIN session, e.g. in the browser console on the deployed app:
//   fetch('/api/system/migrate-customer-tables', { method: 'POST' }).then(r => r.json()).then(console.log)
export async function POST() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const statements = [
    `CREATE TABLE IF NOT EXISTS "Customer" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "email" TEXT,
      "name" TEXT,
      "phone" TEXT,
      "marketingOptIn" BOOLEAN,
      "descopeSyncedAt" DATETIME,
      "goliathUserId" TEXT,
      "goliathSegmentsJson" TEXT,
      "goliathSyncedAt" DATETIME,
      "shopifyCustomerId" TEXT,
      "shopifyLifetimeSpend" REAL,
      "shopifyOrderCount" INTEGER,
      "shopifyLastOrderAt" DATETIME,
      "shopifySyncedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS "Customer_email_idx" ON "Customer"("email")`,
    `CREATE INDEX IF NOT EXISTS "Customer_shopifyLifetimeSpend_idx" ON "Customer"("shopifyLifetimeSpend")`,
    `CREATE TABLE IF NOT EXISTS "CustomerSyncRun" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "source" TEXT NOT NULL,
      "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "finishedAt" DATETIME,
      "status" TEXT NOT NULL DEFAULT 'running',
      "processed" INTEGER NOT NULL DEFAULT 0,
      "errorMessage" TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS "CustomerSyncRun_source_startedAt_idx" ON "CustomerSyncRun"("source", "startedAt")`,
  ];

  for (const sql of statements) {
    await prisma.$executeRawUnsafe(sql);
  }

  return NextResponse.json({ ok: true, applied: statements.length });
}
