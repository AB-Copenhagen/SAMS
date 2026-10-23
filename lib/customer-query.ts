// Mirrors lib/media-query.ts's buildMediaLibraryWhere — same shared-filter-builder pattern,
// used by both the /customers page and its API route so search stays consistent.

export type CustomerFilters = {
  q?: string;
  marketingOptIn?: boolean;
  minSpend?: number;
};

export function buildCustomerWhere(f: CustomerFilters): Record<string, unknown> {
  const AND: Record<string, unknown>[] = [];
  if (f.q) AND.push({ OR: [{ name: { contains: f.q } }, { email: { contains: f.q } }] });
  if (f.marketingOptIn !== undefined) AND.push({ marketingOptIn: f.marketingOptIn });
  if (f.minSpend !== undefined) AND.push({ shopifyLifetimeSpend: { gte: f.minSpend } });
  return AND.length ? { AND } : {};
}
