// Client for the Goliath CDP's public API (https://goliath.si-ab.com/docs/integration).
//
// Pagination envelope for /public/segments confirmed live (2026-10-22, AB's own API key):
// { page, perPage, totalPages, records, totalRecords, data: [...], hasNextPage, hasPrevPage }.
// getSegmentMembers() assumes /public/segments/{id}/users uses the same envelope (AB has no
// segments yet to confirm member row field names against, so those — goliathId/externalId/
// email — are still a best-effort parse per the prose docs; verify once a real segment exists).
//
// GET /public/users/{id} is NOT in Goliath's live OpenAPI spec (GET /docs-json, checked
// 2026-10-27) — only /public/segments*, /public/campaigns/*, and /public/data-points/{keyOrId}/bulk
// are documented. Confirmed live against AB's account (2026-10-27) via a real dashboard-linked
// user id; it returns { id, createdAt, updatedAt, externalId, firstName, lastName, email,
// phoneNumber, phoneCountryCode, lastActiveAt, birthday, ticketProviderUser }. getUserProfile()
// below only reads lastActiveAt — isAppUser/hasPushPermission are in neither this response nor
// anywhere in the OpenAPI spec (see gh-91/gh-93). Being undocumented, this endpoint could change
// or be locked down by Goliath without notice; that risk was accepted deliberately (gh-91) rather
// than block on Goliath/SportsInnovation documenting it.

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

// Temporary diagnostic (see app/api/system/debug-goliath-segments) — returns a segment's member
// rows completely unparsed, to confirm the real field names /public/segments/{id}/users returns
// now that AB has live segments with real members. getSegmentMembers's goliathId/externalId/email
// parse above was only ever a best-effort guess from the prose docs (see the top-of-file comment:
// AB had no segments to confirm the real shape against when it was written) — sync-goliath-segments
// reports success but matches zero customers, which is consistent with that guess being wrong.
// Delete this export and the route once the real shape is confirmed and getSegmentMembers is fixed.
export async function debugRawSegmentMembersPage(segmentId: string): Promise<unknown> {
  const res = await goliathFetch(`/public/segments/${segmentId}/users?page=1&perPage=5`);
  return res.json();
}

export type GoliathUserProfile = { lastActiveAt: Date | null };

// A 404 means Goliath has no profile for this id and is treated as "no data" (returns null) so
// the caller can null out its own synced field to match — not thrown as an error, which would
// instead leave a stale value in place (see gh-91 spec Answer 3).
export async function getUserProfile(goliathUserId: string): Promise<GoliathUserProfile | null> {
  const res = await fetch(`${BASE_URL}/public/users/${encodeURIComponent(goliathUserId)}`, {
    headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Goliath API /public/users/${goliathUserId} failed: ${res.status} ${await res.text()}`);

  const data = (await res.json()) as Record<string, unknown>;
  return { lastActiveAt: typeof data.lastActiveAt === 'string' ? new Date(data.lastActiveAt) : null };
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

// Deep link to a fan's record in the Goliath dashboard (not the API docs host). Nothing fetched
// from this codebase's Goliath docs names that dashboard's per-user URL — only SportsInnovation
// or whoever uses the dashboard day to day would know it — so this is driven entirely by
// GOLIATH_DASHBOARD_USER_URL_TEMPLATE (a full URL containing a literal "{id}" placeholder)
// rather than a guessed path. Returns null, hiding the link, until that's set.
export function userDashboardUrl(goliathUserId: string): string | null {
  const template = process.env.GOLIATH_DASHBOARD_USER_URL_TEMPLATE;
  if (!template) return null;
  return template.replace('{id}', encodeURIComponent(goliathUserId));
}
