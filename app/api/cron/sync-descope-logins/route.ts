import { NextResponse } from 'next/server';
import { createPrismaClient } from '../../../../lib/db';
import { fetchRecentLogins } from '../../../../lib/descope-customers';
import { supersedeStaleRun } from '../../../../lib/customer-sync-run';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// Must match this cron's own schedule in vercel.json, plus a small overlap to tolerate
// scheduling jitter — same approach as auth.ab.dk's api/poll-descope-audit.js. The overlap
// means a login can be processed twice; harmless here since this only ever sets the newest
// value it has seen for a user, never appends.
const WINDOW_MS = 30 * 60 * 1000;
const OVERLAP_MS = 5 * 60 * 1000;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

// Descope's user object has no last-login field (see lib/descope-customers.ts), so this walks
// recent LoginSucceed audit events instead and records each user's latest login time/IP/geo.
// Separate from sync-customers since it reads a different API (audit, not user search) on what
// may end up being a different cadence.
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const db = createPrismaClient();
  await supersedeStaleRun(db, 'descope-logins');
  const startedAt = new Date();
  const run = await db.customerSyncRun.create({ data: { source: 'descope-logins', startedAt, status: 'running' } });

  try {
    const to = Date.now();
    const from = to - WINDOW_MS - OVERLAP_MS;
    const logins = await fetchRecentLogins(from, to);

    let processed = 0;
    for (const [customerId, login] of logins) {
      await db.customer.updateMany({
        where: { id: customerId },
        data: { lastLoginAt: login.occurredAt, lastLoginIp: login.ip, lastLoginCountry: login.country },
      });
      processed++;
    }

    const finishedAt = new Date();
    await db.customerSyncRun.update({ where: { id: run.id }, data: { status: 'success', finishedAt, processed } });
    return NextResponse.json({ status: 'ok', processed });
  } catch (err) {
    const finishedAt = new Date();
    await db.customerSyncRun.update({
      where: { id: run.id },
      data: { status: 'error', finishedAt, errorMessage: err instanceof Error ? err.message : String(err) },
    });
    return NextResponse.json({ message: 'Sync failed' }, { status: 500 });
  } finally {
    await db.$disconnect();
  }
}
