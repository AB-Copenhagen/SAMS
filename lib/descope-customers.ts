// Client for the consumer-facing "MyAB" Descope project — the AB mobile app's own project,
// which is NOT this app's own staff-login project (see lib/descope.ts for that one, and keep
// the two separate: this one authenticates nothing, it only reads fan profiles for the
// customer sync cron via a Management Key scoped to the MyAB project).

export type DescopeCustomer = {
  userId: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  marketingOptIn: boolean | null;
  createdAt: Date | null;
};

// Custom attribute key (MyAB project console → Custom attributes) that holds marketing
// consent. Confirmed live against the MyAB project — overridable in case it's renamed later.
const MARKETING_ATTRIBUTE_KEY = process.env.DESCOPE_MARKETING_ATTRIBUTE_KEY ?? 'marketingOptIn';

const PAGE_SIZE = 100;

function projectId(): string {
  const id = process.env.DESCOPE_CUSTOMER_PROJECT_ID;
  if (!id) throw new Error('DESCOPE_CUSTOMER_PROJECT_ID is not set');
  return id;
}

function managementKey(): string {
  const key = process.env.DESCOPE_CUSTOMER_MANAGEMENT_KEY;
  if (!key) throw new Error('DESCOPE_CUSTOMER_MANAGEMENT_KEY is not set');
  return key;
}

type RawDescopeUser = {
  userId: string;
  email?: string;
  name?: string;
  givenName?: string;
  middleName?: string;
  familyName?: string;
  phone?: string;
  loginIds?: string[];
  customAttributes?: Record<string, unknown>;
  createdTime?: number; // epoch SECONDS (confirmed live — unlike audit's `occurred`, which is ms)
};

// `name` is frequently blank even when givenName/familyName are populated (confirmed live: ~12%
// of a sample had this split) — falling back to assembling it from the parts keeps those
// customers findable by the /customers name search instead of silently losing their name.
function resolveName(raw: RawDescopeUser): string | null {
  if (raw.name) return raw.name;
  const parts = [raw.givenName, raw.middleName, raw.familyName].filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}

function toCustomer(raw: RawDescopeUser): DescopeCustomer {
  const marketingValue = raw.customAttributes?.[MARKETING_ATTRIBUTE_KEY];
  return {
    userId: raw.userId,
    email: raw.email ?? raw.loginIds?.[0] ?? null,
    name: resolveName(raw),
    phone: raw.phone ?? null,
    marketingOptIn: typeof marketingValue === 'boolean' ? marketingValue : null,
    createdAt: typeof raw.createdTime === 'number' ? new Date(raw.createdTime * 1000) : null,
  };
}

// Pages through every user in the MyAB project via the Search Users Management API
// (POST /v2/mgmt/user/search — an empty-ish payload matches everyone). This runs on a cron
// schedule rather than in a request path, so a full sweep each run is acceptable for Phase 1;
// revisit with an incremental filter if the fan base grows large enough to make that slow.
export async function* iterateAllCustomers(): AsyncGenerator<DescopeCustomer> {
  let page = 0;
  for (;;) {
    const res = await fetch('https://api.descope.com/v2/mgmt/user/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${projectId()}:${managementKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ limit: PAGE_SIZE, page }),
    });

    if (!res.ok) {
      throw new Error(`Descope user search failed: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as { users: RawDescopeUser[] };
    if (!data.users?.length) return;

    for (const raw of data.users) yield toCustomer(raw);

    if (data.users.length < PAGE_SIZE) return;
    page++;
  }
}

export type RecentLogin = { occurredAt: Date; ip: string | null; country: string | null };

type RawAuditEvent = { userId?: string; occurred?: number; geo?: string; remoteAddress?: string };

// Descope's user object has no last-login field — this comes from the Search Audit API instead
// (same endpoint/auth shape as auth.ab.dk's api/poll-descope-audit.js, confirmed live:
// response is `{ audits, total }`, `occurred` is epoch MS, `geo` is a 2-letter country code).
// There's no documented bulk "last login per user" endpoint, so this fetches recent
// LoginSucceed events for the window and reduces to one per user here.
export async function fetchRecentLogins(fromMs: number, toMs: number): Promise<Map<string, RecentLogin>> {
  const res = await fetch('https://api.descope.com/v1/mgmt/audit/search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${projectId()}:${managementKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      auditTypes: ['info', 'warn', 'error'],
      actions: ['LoginSucceed'],
      from: String(fromMs),
      to: String(toMs),
      size: 500,
      oldestFirst: false, // newest-first, so the first event seen per userId is already their latest
    }),
  });

  if (!res.ok) {
    throw new Error(`Descope audit search failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { audits?: RawAuditEvent[] };
  const logins = new Map<string, RecentLogin>();
  for (const event of data.audits ?? []) {
    if (!event.userId || logins.has(event.userId)) continue; // already have this user's latest
    const occurredMs = Number(event.occurred);
    if (!Number.isFinite(occurredMs)) continue;
    logins.set(event.userId, {
      occurredAt: new Date(occurredMs),
      ip: event.remoteAddress ?? null,
      country: event.geo ?? null,
    });
  }
  return logins;
}
