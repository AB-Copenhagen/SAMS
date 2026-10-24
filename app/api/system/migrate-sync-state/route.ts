import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';

// One-shot: creates the SyncState table (cron resume cursors — see
// app/api/cron/sync-customers) if it doesn't already exist. Safe to call more than once.
// Call from an authenticated ADMIN session, e.g. in the browser console on the deployed app:
//   fetch('/api/system/migrate-sync-state', { method: 'POST' }).then(r => r.json()).then(console.log)
export async function POST() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SyncState" (
      "key" TEXT NOT NULL PRIMARY KEY,
      "value" TEXT NOT NULL,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  return NextResponse.json({ ok: true });
}
