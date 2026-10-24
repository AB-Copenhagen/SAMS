// Query functions backing /customers/reports. Each pulls one narrow column across all
// customers and buckets in JS, same approach as lib/customer-query.ts's
// listDistinctGoliathSegments/topGoliathSegments — simple at this table's scale (low
// thousands of rows), and avoids SQLite-specific aggregation SQL for what's a one-time-per-
// cache-window read. Cached the same way as getCachedCustomerDashboard (TTL, not
// invalidated on write — nothing here needs to react to a single row changing immediately).

import { unstable_cache } from 'next/cache';
import { prisma } from './db';
import { getCachedMatches, getTicketsSoldCount, mergeMatchesByDay, opponentName } from './vivenu';

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

// Tickets sold come live from Vivenu per match (works for every match, past or future —
// see lib/vivenu.ts's listMatches/getTicketsSoldCount). Checked-in can only come from our own
// accumulated scan.created webhook data — Vivenu's check-in/scan service rejects our API key
// outright, so there's no equivalent live query to fall back on (see lib/vivenu.ts's note on
// getTicket). That half of this report is only as complete as what the webhook has delivered
// since it went live — 0 for matches before that, including ones that already happened.
async function getMatchAttendanceUncached(): Promise<MatchAttendance[]> {
  const [matches, customers] = await Promise.all([
    getCachedMatches(),
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

  // Merging duplicate Event records for the same real match (see mergeMatchesByDay's comment) —
  // without it, one match's sales/attendance were silently split across two bars, which is what
  // made this look date-indexed rather than event-indexed in the first place.
  const recentMatches = mergeMatchesByDay(matches).slice(-10);

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

export type MatchActivitySummary = {
  ticketsSold: number;
  checkedIn: number;
  guestCheckins: number;
  noShow: number;
  newFans: number;
  returningFans: number;
};

export type TopFan = {
  id: string;
  name: string | null;
  email: string | null;
  matchesAttended: number;
  seasonPass: boolean;
};

export type MatchActivity = { summary: MatchActivitySummary; topFans: TopFan[] };

const TOP_FANS_LIMIT = 15;

// Per-match drill-down for the live match-day view (app/customers/match-activity), as opposed to
// the cross-match trend above. "New" vs "returning" is approximated from
// vivenuMatchesAttendedCount alone (<=1 means this is the only match in their attended set) since
// that set doesn't record attendance order — good enough to answer "did we convert a first-timer"
// without needing per-match timestamps we don't have.
async function getMatchActivityUncached(eventIds: string[]): Promise<MatchActivity> {
  const [ticketsSold, attendedCustomers, guestCheckins] = await Promise.all([
    Promise.all(eventIds.map((id) => getTicketsSoldCount(id).catch(() => 0))).then((counts) =>
      counts.reduce((a, b) => a + b, 0)
    ),
    prisma.customer.findMany({
      where: { vivenuAttendedEventIdsJson: { not: null } },
      select: {
        id: true,
        name: true,
        email: true,
        vivenuAttendedEventIdsJson: true,
        vivenuMatchesAttendedCount: true,
        vivenuSeasonPassStatus: true,
      },
    }),
    // Approved check-ins whose ticket had no linkable Customer (away-team, comp, internal
    // tickets, etc. — see gh-62) — counted separately so "Checked in" keeps meaning "known fan
    // checked in" and no-show math isn't skewed by guests who were never counted as fans.
    prisma.guestCheckin.count({ where: { eventId: { in: eventIds } } }),
  ]);

  const idSet = new Set(eventIds);
  const checkedInCustomers = attendedCustomers.filter((c) => {
    try {
      return (JSON.parse(c.vivenuAttendedEventIdsJson ?? '[]') as string[]).some((id) => idSet.has(id));
    } catch {
      return false; // malformed JSON from a prior sync — exclude rather than fail the whole report
    }
  });

  const newFans = checkedInCustomers.filter((c) => (c.vivenuMatchesAttendedCount ?? 0) <= 1).length;

  const topFans = [...checkedInCustomers]
    .sort((a, b) => (b.vivenuMatchesAttendedCount ?? 0) - (a.vivenuMatchesAttendedCount ?? 0))
    .slice(0, TOP_FANS_LIMIT)
    .map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      matchesAttended: c.vivenuMatchesAttendedCount ?? 0,
      seasonPass: !!c.vivenuSeasonPassStatus,
    }));

  return {
    summary: {
      ticketsSold,
      checkedIn: checkedInCustomers.length,
      guestCheckins,
      noShow: Math.max(0, ticketsSold - checkedInCustomers.length - guestCheckins),
      newFans,
      returningFans: checkedInCustomers.length - newFans,
    },
    topFans,
  };
}

// 30s TTL, not 300s like the reports above — this view is for monitoring check-ins while a match
// is actually in progress, where a 5-minute-stale count is too slow to be useful. Keyed by
// eventIds, so each match (and the merged-duplicate-event id set behind it) gets its own entry.
export const getCachedMatchActivity = unstable_cache(getMatchActivityUncached, ['match-activity'], { revalidate: 30 });

// 300s TTL, same as getCachedCustomerDashboard — these are report views, not live counters.
export const getCachedSpendDistribution = unstable_cache(getSpendDistributionUncached, ['report-spend-distribution'], { revalidate: 300 });
export const getCachedMatchAttendance = unstable_cache(getMatchAttendanceUncached, ['report-match-attendance'], { revalidate: 300 });
export const getCachedAttendanceCohorts = unstable_cache(getAttendanceCohortsUncached, ['report-attendance-cohorts'], { revalidate: 300 });
export const getCachedCustomerGrowth = unstable_cache(getCustomerGrowthByMonthUncached, ['report-customer-growth'], { revalidate: 300 });
export const getCachedSeasonPassRate = unstable_cache(getSeasonPassRateUncached, ['report-season-pass-rate'], { revalidate: 300 });
