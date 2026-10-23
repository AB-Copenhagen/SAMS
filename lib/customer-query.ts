// Mirrors lib/media-query.ts's buildMediaLibraryWhere — same shared-filter-builder pattern,
// used by both the /customers page and its API route so search stays consistent.

import { prisma } from './db';

export type CustomerFilters = {
  q?: string;
  marketingOptIn?: boolean;
  minSpend?: number;
  segment?: string;
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
  return AND.length ? { AND } : {};
}

// Powers the segment filter's <select> options on /customers — small, fixed-size set (a club's
// total segment count), so a full scan of the (indexed-elsewhere) goliathSegmentsJson column is
// fine rather than needing a dedicated Segment table.
export async function listDistinctGoliathSegments(): Promise<string[]> {
  const rows = await prisma.customer.findMany({
    where: { goliathSegmentsJson: { not: null } },
    select: { goliathSegmentsJson: true },
  });
  const names = new Set<string>();
  for (const row of rows) {
    try {
      for (const name of JSON.parse(row.goliathSegmentsJson ?? '[]') as string[]) names.add(name);
    } catch {
      // malformed JSON from a prior sync — skip rather than fail the whole filter list
    }
  }
  return [...names].sort();
}
