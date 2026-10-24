import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';

// One-shot: creates the GuestCheckin table (see prisma/schema.prisma) backing the "Guest
// check-ins" stat added in gh-62. Same no-migrations convention as migrate-vivenu-fields — safe
// to call more than once (CREATE TABLE IF NOT EXISTS).
// Call from an authenticated ADMIN session, e.g. in the browser console on the deployed app:
//   fetch('/api/system/add-guest-checkin-table', { method: 'POST' }).then(r => r.json()).then(console.log)
export async function POST() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "GuestCheckin" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "eventId" TEXT NOT NULL,
      "ticketId" TEXT NOT NULL,
      "scannedAt" DATETIME NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "GuestCheckin_ticketId_key" UNIQUE ("ticketId")
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "GuestCheckin_eventId_idx" ON "GuestCheckin" ("eventId")`);

  return NextResponse.json({ ok: true });
}
