// Query functions backing /customers/reports. Each pulls one narrow column across all
// customers and buckets in JS, same approach as lib/customer-query.ts's
// listDistinctGoliathSegments/topGoliathSegments — simple at this table's scale (low
// thousands of rows), and avoids SQLite-specific aggregation SQL for what's a one-time-per-
// cache-window read. Cached the same way as getCachedCustomerDashboard (TTL, not
// invalidated on write — nothing here needs to react to a single row changing immediately).

import { unstable_cache } from 'next/cache';
import { prisma } from './db';

export type Bucket = { label: string; count: number };

const SPEND_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: '0 DKK', min: 0, max: 0 },
  { label: '1-500', min: 1, max: 500 },
  { label: '501-1,500', min: 501, max: 1500 },
  { label: '1,501-3,000', min: 1501, max: 3000 },
  { label: '3,001-6,000', min: 3001, max: 6000 },
  { label: '6,001+', min: 6001, max: Infinity },
];

async function getSpendDistributionUncached(): Promise<Bucket[]> {
  const rows = await prisma.customer.findMany({
    where: { shopifyLifetimeSpend: { not: null } },
    select: { shopifyLifetimeSpend: true },
  });
  return SPEND_BUCKETS.map(({ label, min, max }) => ({
    label,
    count: rows.filter((r) => (r.shopifyLifetimeSpend ?? 0) >= min && (r.shopifyLifetimeSpend ?? 0) <= max).length,
  }));
}

const ATTENDANCE_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: '0 matches', min: 0, max: 0 },
  { label: '1 match', min: 1, max: 1 },
  { label: '2 matches', min: 2, max: 2 },
  { label: '3+ matches', min: 3, max: Infinity },
];

async function getAttendanceCohortsUncached(): Promise<Bucket[]> {
  // Every customer counts here, not just vivenu-linked ones (a customer with no account at
  // all has attended 0 matches, same bucket as one whose count happens to be 0) — vs. the
  // season-pass rate below, which is specifically about EventBilletten-linked customers.
  const rows = await prisma.customer.findMany({ select: { vivenuMatchesAttendedCount: true } });
  return ATTENDANCE_BUCKETS.map(({ label, min, max }) => ({
    label,
    count: rows.filter((r) => {
      const n = r.vivenuMatchesAttendedCount ?? 0;
      return n >= min && n <= max;
    }).length,
  }));
}

export type MonthlyGrowth = { month: string; cumulativeCount: number };

async function getCustomerGrowthByMonthUncached(): Promise<MonthlyGrowth[]> {
  const rows = await prisma.customer.findMany({
    where: { descopeCreatedAt: { not: null } },
    select: { descopeCreatedAt: true },
    orderBy: { descopeCreatedAt: 'asc' },
  });
  if (rows.length === 0) return [];

  const countsByMonth = new Map<string, number>();
  for (const row of rows) {
    const month = row.descopeCreatedAt!.toISOString().slice(0, 7); // "YYYY-MM"
    countsByMonth.set(month, (countsByMonth.get(month) ?? 0) + 1);
  }

  // Fill every month in range, not just months with a signup, so the line doesn't skip
  // gaps and misrepresent the trend as steeper than it was.
  const months = [...countsByMonth.keys()].sort();
  const [startYear, startMonth] = months[0].split('-').map(Number);
  const cursor = new Date(Date.UTC(startYear, startMonth - 1, 1));
  const end = new Date();
  const series: MonthlyGrowth[] = [];
  let cumulative = 0;
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 7);
    cumulative += countsByMonth.get(key) ?? 0;
    series.push({ month: key, cumulativeCount: cumulative });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return series;
}

export type SeasonPassRate = { holders: number; total: number; rate: number };

async function getSeasonPassRateUncached(): Promise<SeasonPassRate> {
  const [holders, total] = await Promise.all([
    prisma.customer.count({ where: { vivenuSeasonPassStatus: { not: null } } }),
    prisma.customer.count(),
  ]);
  return { holders, total, rate: total > 0 ? holders / total : 0 };
}

// 300s TTL, same as getCachedCustomerDashboard — these are report views, not live counters.
export const getCachedSpendDistribution = unstable_cache(getSpendDistributionUncached, ['report-spend-distribution'], { revalidate: 300 });
export const getCachedAttendanceCohorts = unstable_cache(getAttendanceCohortsUncached, ['report-attendance-cohorts'], { revalidate: 300 });
export const getCachedCustomerGrowth = unstable_cache(getCustomerGrowthByMonthUncached, ['report-customer-growth'], { revalidate: 300 });
export const getCachedSeasonPassRate = unstable_cache(getSeasonPassRateUncached, ['report-season-pass-rate'], { revalidate: 300 });
