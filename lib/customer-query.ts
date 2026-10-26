// Mirrors lib/media-query.ts's buildMediaLibraryWhere — same shared-filter-builder pattern,
// used by both the /customers page and its API route so search stays consistent.

import { unstable_cache } from 'next/cache';
import { prisma } from './db';

export type CustomerFilters = {
  q?: string;
  marketingOptIn?: boolean;
  minSpend?: number;
  segment?: string;
  minMatchesAttended?: number;
  seasonPassHolder?: boolean;
};

export function buildCustomerWhere(f: CustomerFilters): Record<string, unknown> {
  const AND: Record<string, unknown>[] = [];
  if (f.q) AND.push({ OR: [{ name: { contains: f.q } }, { email: { contains: f.q } }] });
  if (f.marketingOptIn !== undefined) AND.push({ marketingOptIn: f.marketingOptIn });
  if (f.minSpend !== undefined) AND.push({ shopifyLifetimeSpend: { gte: f.minSpend } });
  // goliathSegmentsJson is a flat JSON-array string (e.g. ["A","B"]), not a relation, so segment
  // membership is a quoted-substring match rather than a real `in` query — fine at the segment
  // counts a club actually has, per lib/goliath.ts's note on this not being a relational store.
  if (f.segment) AND.push({ goliathSegmentsJson: { contains: `"${f.segment}"` } });
  if (f.minMatchesAttended !== undefined) AND.push({ vivenuMatchesAttendedCount: { gte: f.minMatchesAttended } });
  // vivenuSeasonPassStatus holds the GROUP event name for a holder, null otherwise — same
  // not-null-as-boolean derivation as getSeasonPassRateUncached in lib/customer-reports.ts.
  if (f.seasonPassHolder !== undefined) {
    AND.push({ vivenuSeasonPassStatus: f.seasonPassHolder ? { not: null } : null });
  }
  return AND.length ? { AND } : {};
}

// Shared by topGoliathSegments and topMailerliteGroups below — both store membership as a flat
// JSON-array-of-names string on Customer, small/fixed-size sets (a club's total segment or
// MailerLite group count), so a full scan is fine rather than needing a dedicated join table.
async function countJsonArrayField(
  field: 'goliathSegmentsJson' | 'mailerliteGroupsJson',
  limit: number,
): Promise<{ name: string; count: number }[]> {
  const rows = await prisma.customer.findMany({
    where: { [field]: { not: null } },
    select: { [field]: true },
  });
  const counts = new Map<string, number>();
  for (const row of rows) {
    try {
      for (const name of JSON.parse((row as Record<string, string | null>)[field] ?? '[]') as string[]) {
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
    } catch {
      // malformed JSON from a prior sync — skip rather than fail the whole list
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

// Powers both the dashboard's "Top segments" card and the list page's segment filter rail (the
// rail calls this with a high limit so every real segment is filterable, not just the top few).
export function topGoliathSegments(limit: number): Promise<{ name: string; count: number }[]> {
  return countJsonArrayField('goliathSegmentsJson', limit);
}

// Powers the dashboard's "Top MailerLite groups" card.
export function topMailerliteGroups(limit: number): Promise<{ name: string; count: number }[]> {
  return countJsonArrayField('mailerliteGroupsJson', limit);
}

export type CustomerSyncRunSummary = {
  source: string;
  status: string | null;
  startedAt: Date | string | null;
  finishedAt: Date | string | null;
  processed: number | null;
  errorMessage: string | null;
};

export type CustomerDashboardData = {
  topSegments: { name: string; count: number }[];
  topMailerliteGroups: { name: string; count: number }[];
  topSpenders: { id: string; name: string | null; email: string | null; shopifyLifetimeSpend: number | null }[];
  recentLogins: { id: string; name: string | null; email: string | null; lastLoginAt: Date | string | null; lastLoginCountry: string | null }[];
  syncRuns: CustomerSyncRunSummary[];
  shopify: { syncedCount: number; mostRecentSyncedAt: Date | string | null };
};

// Cron/job-sourced sources with a CustomerSyncRun row per run — see app/api/cron/sync-customers,
// sync-descope-logins, sync-goliath-segments. Shopify has no run-level record (it syncs
// per-customer via app/api/jobs/sync-customer-external), so it's summarized separately below.
const SYNC_RUN_SOURCES = ['descope', 'descope-logins', 'goliath'] as const;

// Backs the CRM dashboard (app/customers/page.tsx). Cron-fed data with no single "edit" event
// to invalidate on, so — like lib/lookup-cache.ts's revalidate-only entries — a TTL is the
// right fit rather than an explicit invalidate*() call; 300s keeps this well under the cadence
// of the fastest of these crons (every 30 minutes) while cutting repeat Turso reads on a page
// that would otherwise run 6+ queries per load.
export const getCachedCustomerDashboard = unstable_cache(
  async (): Promise<CustomerDashboardData> => {
    const [topSegments, topMailerliteGroupsResult, topSpenders, recentLogins, syncRuns, shopifySyncedCount, shopifyMostRecent] = await Promise.all([
      topGoliathSegments(6),
      topMailerliteGroups(6),
      prisma.customer.findMany({
        where: { shopifyLifetimeSpend: { not: null } },
        orderBy: { shopifyLifetimeSpend: 'desc' },
        take: 6,
        select: { id: true, name: true, email: true, shopifyLifetimeSpend: true },
      }),
      prisma.customer.findMany({
        where: { lastLoginAt: { not: null } },
        orderBy: { lastLoginAt: 'desc' },
        take: 6,
        select: { id: true, name: true, email: true, lastLoginAt: true, lastLoginCountry: true },
      }),
      Promise.all(
        SYNC_RUN_SOURCES.map((source) =>
          prisma.customerSyncRun.findFirst({ where: { source }, orderBy: { startedAt: 'desc' } }),
        ),
      ),
      prisma.customer.count({ where: { shopifySyncedAt: { not: null } } }),
      prisma.customer.findFirst({ where: { shopifySyncedAt: { not: null } }, orderBy: { shopifySyncedAt: 'desc' }, select: { shopifySyncedAt: true } }),
    ]);

    return {
      topSegments,
      topMailerliteGroups: topMailerliteGroupsResult,
      topSpenders,
      recentLogins,
      syncRuns: SYNC_RUN_SOURCES.map((source, i) => {
        const run = syncRuns[i];
        return {
          source,
          status: run?.status ?? null,
          startedAt: run?.startedAt ?? null,
          finishedAt: run?.finishedAt ?? null,
          processed: run?.processed ?? null,
          errorMessage: run?.errorMessage ?? null,
        };
      }),
      shopify: { syncedCount: shopifySyncedCount, mostRecentSyncedAt: shopifyMostRecent?.shopifySyncedAt ?? null },
    };
  },
  ['customer-dashboard'],
  { tags: ['customer-dashboard'], revalidate: 300 },
);

export type CustomerKpis = {
  total: number;
  optedIn: number;
  optedOut: number;
  goliathSynced: number;
  shopifySynced: number;
  mailerliteSynced: number;
};

// Deliberately not cached, unlike getCachedCustomerDashboard above — these are single indexed
// count()s (cheap) and the dashboard's headline numbers, worth paying for freshness on every load.
export async function getCustomerKpis(): Promise<CustomerKpis> {
  const [total, optedIn, optedOut, goliathSynced, shopifySynced, mailerliteSynced] = await Promise.all([
    prisma.customer.count(),
    prisma.customer.count({ where: { marketingOptIn: true } }),
    prisma.customer.count({ where: { marketingOptIn: false } }),
    prisma.customer.count({ where: { goliathSyncedAt: { not: null } } }),
    prisma.customer.count({ where: { shopifySyncedAt: { not: null } } }),
    prisma.customer.count({ where: { mailerliteSyncedAt: { not: null } } }),
  ]);
  return { total, optedIn, optedOut, goliathSynced, shopifySynced, mailerliteSynced };
}
