import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';

// One-shot data fix: lib/mailerlite.ts previously stored MailerLite's open_rate as-is, but
// MailerLite returns it as a whole-number percentage (e.g. 100 for 17/17 opens), not the 0-1
// fraction the field assumed — every consumer's `* 100` display then showed e.g. 10000%. The
// client now normalizes on fetch, but rows already synced before that fix still hold the raw
// percentage. `WHERE "mailerliteOpenRate" > 1` only ever matches an unnormalized value (a real
// fraction is always <= 1), so this is safe to call more than once.
// Call from an authenticated ADMIN session, e.g. in the browser console on the deployed app:
//   fetch('/api/system/fix-mailerlite-open-rate', { method: 'POST' }).then(r => r.json()).then(console.log)
export async function POST() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const result = await prisma.$executeRawUnsafe(
    `UPDATE "Customer" SET "mailerliteOpenRate" = "mailerliteOpenRate" / 100.0 WHERE "mailerliteOpenRate" > 1`
  );

  return NextResponse.json({ ok: true, rowsFixed: result });
}
