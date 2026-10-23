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
  phone?: string;
  loginIds?: string[];
  customAttributes?: Record<string, unknown>;
};

function toCustomer(raw: RawDescopeUser): DescopeCustomer {
  const marketingValue = raw.customAttributes?.[MARKETING_ATTRIBUTE_KEY];
  return {
    userId: raw.userId,
    email: raw.email ?? raw.loginIds?.[0] ?? null,
    name: raw.name ?? null,
    phone: raw.phone ?? null,
    marketingOptIn: typeof marketingValue === 'boolean' ? marketingValue : null,
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
