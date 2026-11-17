// gh-113: daily snapshot of total/added/lost Descope (MyAB) user counts. The local Customer
// table can't tell us "current total" on its own — rows are never deleted on Descope-side
// removal (see app/api/cron/sync-customers) — so this walks Descope directly for a complete,
// same-day user-ID set and diffs it against the prior snapshot's ID set.

import type { AppPrismaClient } from './db';
import { iterateAllUserIds } from './descope-customers';

export type SnapshotCounts = { totalCount: number; addedCount: number; lostCount: number };

// Pure: the actual counting logic, kept separate from the Descope walk/DB IO below so it's
// directly unit-testable. previousIds === null means there's no prior snapshot to diff against
// (the very first run) — every current id counts as "added", nothing as "lost".
export function computeSnapshotCounts(todayIds: Set<string>, previousIds: Set<string> | null): SnapshotCounts {
  const totalCount = todayIds.size;
  if (previousIds === null) {
    return { totalCount, addedCount: totalCount, lostCount: 0 };
  }

  let addedCount = 0;
  for (const id of todayIds) if (!previousIds.has(id)) addedCount++;

  let lostCount = 0;
  for (const id of previousIds) if (!todayIds.has(id)) lostCount++;

  return { totalCount, addedCount, lostCount };
}

// 90d — see gh-113 spec. Aggregate counts are kept forever; only the raw id list (needed to
// diff against the *next* day) is pruned.
const ID_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

// Pure: whether a snapshot row's raw idsJson is old enough to null out, given `now`.
export function isSnapshotIdsStale(date: Date, now: Date): boolean {
  return now.getTime() - date.getTime() > ID_RETENTION_MS;
}

// Pure: truncates to the start of the UTC day — the canonical `date` every snapshot row is
// keyed on (one row per calendar day, idempotent against a same-day retry of the cron).
export function dayStartUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// IO edge: walks Descope for today's complete user-ID set, diffs it against the most recent
// prior snapshot that still has its id list, and upserts today's DescopeUserSnapshot row. Also
// prunes idsJson on any row past ID_RETENTION_MS. Called from app/api/cron/sync-customers's
// `finally` block, so it runs once per invocation regardless of whether that cron's own
// (heavier, resumable) walk completed a full lap — callers should catch and log, not propagate,
// since a snapshot hiccup shouldn't fail the customer sync run itself.
export async function captureDailySnapshot(db: AppPrismaClient, now = new Date()): Promise<void> {
  const date = dayStartUtc(now);

  const todayIds = new Set<string>();
  for await (const id of iterateAllUserIds()) todayIds.add(id);

  // `date: { lt: date }` excludes today's own row — without it, a same-day re-run (e.g. the
  // cron retried after a timeout) would find the row *this same call* already wrote, diff
  // today's id set against itself, and overwrite the first run's real counts with zeros.
  const previous = await db.descopeUserSnapshot.findFirst({
    where: { idsJson: { not: null }, date: { lt: date } },
    orderBy: { date: 'desc' },
    select: { idsJson: true },
  });
  const previousIds = previous?.idsJson ? new Set<string>(JSON.parse(previous.idsJson)) : null;

  const { totalCount, addedCount, lostCount } = computeSnapshotCounts(todayIds, previousIds);
  const idsJson = JSON.stringify([...todayIds]);

  await db.descopeUserSnapshot.upsert({
    where: { date },
    create: { date, totalCount, addedCount, lostCount, idsJson },
    update: { totalCount, addedCount, lostCount, idsJson },
  });

  const rowsWithIds = await db.descopeUserSnapshot.findMany({
    where: { idsJson: { not: null } },
    select: { id: true, date: true },
  });
  const staleIds = rowsWithIds.filter((r) => isSnapshotIdsStale(r.date, now)).map((r) => r.id);
  if (staleIds.length > 0) {
    await db.descopeUserSnapshot.updateMany({ where: { id: { in: staleIds } }, data: { idsJson: null } });
  }
}
