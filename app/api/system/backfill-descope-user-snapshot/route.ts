import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';
import { dayStartUtc } from '../../../../lib/descope-user-snapshot';

// One-shot: backfills DescopeUserSnapshot's "added" history (see gh-113) from existing
// Customer.descopeCreatedAt data, for every day that doesn't already have a snapshot row.
// totalCount/lostCount/idsJson are left null on these rows — unlike addedCount, they can't be
// reconstructed after the fact (the local Customer table was never a reliable record of who'd
// been removed from Descope). Safe to call more than once: days that already have a row
// (backfilled or from the live daily job) are left untouched.
// Call from an authenticated ADMIN session, e.g. in the browser console on the deployed app:
//   fetch('/api/system/backfill-descope-user-snapshot', { method: 'POST' }).then(r => r.json()).then(console.log)
export async function POST() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const customers = await prisma.customer.findMany({
    where: { descopeCreatedAt: { not: null } },
    select: { descopeCreatedAt: true },
  });

  const addedCountByDay = new Map<string, number>();
  for (const { descopeCreatedAt } of customers) {
    const key = dayStartUtc(descopeCreatedAt!).toISOString();
    addedCountByDay.set(key, (addedCountByDay.get(key) ?? 0) + 1);
  }

  const existingRows = await prisma.descopeUserSnapshot.findMany({ select: { date: true } });
  const existingDayKeys = new Set(existingRows.map((r) => r.date.toISOString()));

  let backfilled = 0;
  for (const [dayKey, addedCount] of addedCountByDay) {
    if (existingDayKeys.has(dayKey)) continue;

    // A unique-constraint hit just means this day's row was created concurrently (e.g. a
    // same-day cron run) since the existingDayKeys snapshot above — not a real failure.
    await prisma.descopeUserSnapshot.create({
      data: { date: new Date(dayKey), addedCount, totalCount: null, lostCount: null, idsJson: null },
    }).then(
      () => { backfilled++; },
      () => {}
    );
  }

  return NextResponse.json({ ok: true, daysBackfilled: backfilled, daysSkippedExisting: existingDayKeys.size });
}
