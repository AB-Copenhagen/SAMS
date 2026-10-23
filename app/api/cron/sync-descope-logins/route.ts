import { NextResponse } from 'next/server';
import { createPrismaClient } from '../../../../lib/db';
import { fetchRecentLogins } from '../../../../lib/descope-customers';
import { supersedeStaleRun } from '../../../../lib/customer-sync-run';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// Must match this cron's own schedule in vercel.json, plus a small overlap to tolerate
// scheduling jitter — same approach as auth.ab.dk's api/poll-descope-audit.js. The overlap
// means a login can be seen twice: harmless for the Customer.lastLoginAt snapshot below (it
// only ever sets the newest value seen), and absorbed by CustomerActivity's unique constraint
// for the per-event log (each insert below just no-ops on a duplicate).
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
    const { latestByUser, events } = await fetchRecentLogins(from, to);

    let processed = 0;
    for (const [customerId, login] of latestByUser) {
      await db.customer.updateMany({
        where: { id: customerId },
        data: { lastLoginAt: login.occurredAt, lastLoginIp: login.ip, lastLoginCountry: login.country },
      });
      processed++;
    }

    // createMany's skipDuplicates isn't supported on SQLite (this schema's provider), so each
    // event is inserted individually — a unique-constraint hit just means this exact login was
    // already logged (the deliberate window overlap above), not a real failure.
    for (const e of events) {
      await db.customerActivity.create({
        data: {
          customerId: e.userId,
          type: 'login',
          occurredAt: e.occurredAt,
          detail: e.country ? `Logged in from ${e.country}` : 'Logged in',
        },
      }).catch(() => {});
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
