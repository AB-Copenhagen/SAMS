import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';

// One-shot: adds descopeCreatedAt/lastLoginAt/lastLoginIp/lastLoginCountry to the existing
// Customer table. Unlike CREATE TABLE IF NOT EXISTS, SQLite's ADD COLUMN has no "if not exists"
// form, so a second run logs a "duplicate column" error per statement but still returns ok —
// safe to call more than once, same as this repo's other one-shot migration routes.
// Call from an authenticated ADMIN session, e.g. in the browser console on the deployed app:
//   fetch('/api/system/migrate-customer-login-fields', { method: 'POST' }).then(r => r.json()).then(console.log)
export async function POST() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const statements = [
    `ALTER TABLE "Customer" ADD COLUMN "descopeCreatedAt" DATETIME`,
    `ALTER TABLE "Customer" ADD COLUMN "lastLoginAt" DATETIME`,
    `ALTER TABLE "Customer" ADD COLUMN "lastLoginIp" TEXT`,
    `ALTER TABLE "Customer" ADD COLUMN "lastLoginCountry" TEXT`,
  ];

  let applied = 0;
  for (const sql of statements) {
    try {
      await prisma.$executeRawUnsafe(sql);
      applied++;
    } catch (err) {
      console.warn(`[migrate-customer-login-fields] skipped (likely already applied): ${sql}`, err);
    }
  }

  return NextResponse.json({ ok: true, applied, total: statements.length });
}
