import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';

// One-shot (gh-76): creates the StaffUser table (SAMS's own login roster, replacing Descope's
// role console as the access gate) if it doesn't already exist, and seeds the one admin row
// needed to bootstrap the new Admin -> Users invite UI once the login gate cuts over to it.
// Safe to call more than once — the seed insert is a no-op if the row already exists. Must be
// run in production BEFORE the login-gate cutover (Phase 3) ships, or that deploy locks everyone
// out, since nobody would have a StaffUser row yet. Call from an authenticated ADMIN session:
//   fetch('/api/system/migrate-staff-users', { method: 'POST' }).then(r => r.json()).then(console.log)
export async function POST() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const statements = [
    `CREATE TABLE IF NOT EXISTS "StaffUser" (
      "email" TEXT NOT NULL PRIMARY KEY,
      "role" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "descopeUserId" TEXT,
      "name" TEXT,
      "invitedBy" TEXT,
      "invitedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  ];

  for (const sql of statements) {
    await prisma.$executeRawUnsafe(sql);
  }

  const seeded = await prisma.staffUser.upsert({
    where: { email: 'zsmith@ab.dk' },
    update: {},
    create: { email: 'zsmith@ab.dk', role: 'ADMIN', status: 'ACTIVE', invitedBy: 'system' },
  });

  return NextResponse.json({ ok: true, applied: statements.length, seeded: seeded.email });
}
