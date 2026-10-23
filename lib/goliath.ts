// Client for the Goliath CDP's public API (https://goliath.si-ab.com/docs/integration).
//
// Pagination envelope for /public/segments confirmed live (2026-10-22, AB's own API key):
// { page, perPage, totalPages, records, totalRecords, data: [...], hasNextPage, hasPrevPage }.
// getSegmentMembers() assumes /public/segments/{id}/users uses the same envelope (AB has no
// segments yet to confirm member row field names against, so those — goliathId/externalId/
// email — are still a best-effort parse per the prose docs; verify once a real segment exists).

const BASE_URL = (process.env.GOLIATH_API_BASE_URL ?? 'https://goliath-api.si-ab.com').replace(/\/$/, '');

function apiKey(): string {
  const key = process.env.GOLIATH_API_KEY;
  if (!key) throw new Error('GOLIATH_API_KEY is not set');
  return key;
}

async function goliathFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (!res.ok) throw new Error(`Goliath API ${path} failed: ${res.status} ${await res.text()}`);
  return res;
}

type GoliathPage<T> = { data: T[]; hasNextPage: boolean };

async function fetchAllPages<T>(path: string): Promise<T[]> {
  const items: T[] = [];
  let page = 1;
  for (;;) {
    const sep = path.includes('?') ? '&' : '?';
    const res = await goliathFetch(`${path}${sep}page=${page}&perPage=100`);
    const data = (await res.json()) as GoliathPage<T>;
    items.push(...(data.data ?? []));
    if (!data.hasNextPage) return items;
    page++;
  }
}

export type GoliathSegment = { id: string; name: string };

export async function listSegments(): Promise<GoliathSegment[]> {
  return fetchAllPages<GoliathSegment>('/public/segments');
}

export type GoliathSegmentMember = { goliathUserId: string; externalId: string | null; email: string | null };

export async function getSegmentMembers(segmentId: string): Promise<GoliathSegmentMember[]> {
  const rows = await fetchAllPages<Record<string, unknown>>(`/public/segments/${segmentId}/users`);
  return rows.map((u) => ({
    goliathUserId: String(u.goliathId ?? u.id ?? ''),
    externalId: typeof u.externalId === 'string' ? u.externalId : null,
    email: typeof u.email === 'string' ? u.email : null,
  }));
}

export type GoliathUserProvider = 'club' | 'email' | 'phone' | 'goliath' | 'ligalogin' | 'eventii' | 'roboticket';
export type DataPointUsers = { provider: GoliathUserProvider; identifiers: string[] };
export type DataPointResult = { users: { identifier: string; userId?: string; status: 'found' | 'notFound' }[] };

// Writes one data point value for up to 1,000 users in a single call — fully documented
// (https://goliath.si-ab.com/docs/integration/customer-user-database/push-data-points). Not
// used by Phase 1's read-only sync, but Phase 2/3 (pushing consent or segment changes back to
// Goliath) build directly on this.
export async function pushDataPoint(
  keyOrId: string,
  value: unknown,
  users: DataPointUsers,
  scopeValue?: string
): Promise<DataPointResult> {
  const res = await goliathFetch(`/public/data-points/${keyOrId}/bulk`, {
    method: 'POST',
    body: JSON.stringify({ value, scopeValue, users }),
  });
  return (await res.json()) as DataPointResult;
}
