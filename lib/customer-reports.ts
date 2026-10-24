// Query functions backing /customers/reports. Each pulls one narrow column across all
// customers and buckets in JS, same approach as lib/customer-query.ts's
// listDistinctGoliathSegments/topGoliathSegments — simple at this table's scale (low
// thousands of rows), and avoids SQLite-specific aggregation SQL for what's a one-time-per-
// cache-window read. Cached the same way as getCachedCustomerDashboard (TTL, not
// invalidated on write — nothing here needs to react to a single row changing immediately).

import { unstable_cache } from 'next/cache';
import { prisma } from './db';
import { listMatches, getTicketsSoldCount } from './vivenu';

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

export type MatchAttendance = { label: string; date: string; ticketsSold: number; checkedIn: number; noShow: number };

// Strips the "AB vs "/"AB mod " prefix every match name shares (confirmed live) so the chart's
// x-axis can show just the opponent, which is both more compact and more informative than a
// bare date for telling bars apart.
function opponentName(matchName: string): string {
  return matchName.replace(/^AB\s+(vs|mod)\s+/i, '').trim();
}

// Tickets sold come live from Vivenu per match (works for every match, past or future —
// see lib/vivenu.ts's listMatches/getTicketsSoldCount). Checked-in can only come from our own
// accumulated scan.created webhook data — Vivenu's check-in/scan service rejects our API key
// outright, so there's no equivalent live query to fall back on (see lib/vivenu.ts's note on
// getTicket). That half of this report is only as complete as what the webhook has delivered
// since it went live — 0 for matches before that, including ones that already happened.
async function getMatchAttendanceUncached(): Promise<MatchAttendance[]> {
  const [matches, customers] = await Promise.all([
    listMatches(),
    prisma.customer.findMany({
      where: { vivenuAttendedEventIdsJson: { not: null } },
      select: { vivenuAttendedEventIdsJson: true },
    }),
  ]);

  const checkedInByEvent = new Map<string, number>();
  for (const c of customers) {
    try {
      for (const eventId of JSON.parse(c.vivenuAttendedEventIdsJson ?? '[]') as string[]) {
        checkedInByEvent.set(eventId, (checkedInByEvent.get(eventId) ?? 0) + 1);
      }
    } catch {
      // malformed JSON from a prior sync — skip rather than fail the whole report
    }
  }

  // AB's Vivenu account has duplicate Event records for the same real match — confirmed live,
  // e.g. "AB vs EfB" and "AB vs Esbjerg fB" at the identical start timestamp, "AB vs Aarhus
  // Fremad!" vs "AB vs Aarhus Fremad". AB never plays twice in one calendar day, so grouping by
  // UTC date is a safe real-world merge key — without it, one match's sales/attendance were
  // silently split across two bars, which is what made this look date-indexed rather than
  // event-indexed in the first place.
  const groups = new Map<string, { name: string; start: string; ids: string[] }>();
  for (const match of matches) {
    const day = match.start.slice(0, 10);
    const group = groups.get(day);
    if (!group) {
      groups.set(day, { name: match.name, start: match.start, ids: [match.id] });
    } else {
      group.ids.push(match.id);
      // Prefer a "vs" name over a "mod" one when merging duplicates — purely cosmetic, both
      // refer to the same real match either way.
      if (/\bmod\b/i.test(group.name) && /\bvs\b/i.test(match.name)) group.name = match.name;
    }
  }

  const recentMatches = [...groups.values()].sort((a, b) => a.start.localeCompare(b.start)).slice(-10);

  const results: MatchAttendance[] = [];
  for (const match of recentMatches) {
    let ticketsSold = 0;
    let checkedIn = 0;
    for (const id of match.ids) {
      ticketsSold += await getTicketsSoldCount(id).catch(() => 0);
      checkedIn += checkedInByEvent.get(id) ?? 0;
    }
    results.push({
      label: opponentName(match.name),
      date: new Date(match.start).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
      ticketsSold,
      checkedIn,
      noShow: Math.max(0, ticketsSold - checkedIn),
    });
  }
  return results;
}

// 300s TTL, same as getCachedCustomerDashboard — these are report views, not live counters.
export const getCachedSpendDistribution = unstable_cache(getSpendDistributionUncached, ['report-spend-distribution'], { revalidate: 300 });
export const getCachedMatchAttendance = unstable_cache(getMatchAttendanceUncached, ['report-match-attendance'], { revalidate: 300 });
export const getCachedAttendanceCohorts = unstable_cache(getAttendanceCohortsUncached, ['report-attendance-cohorts'], { revalidate: 300 });
export const getCachedCustomerGrowth = unstable_cache(getCustomerGrowthByMonthUncached, ['report-customer-growth'], { revalidate: 300 });
export const getCachedSeasonPassRate = unstable_cache(getSeasonPassRateUncached, ['report-season-pass-rate'], { revalidate: 300 });
