// Client for MailerLite's current "Connect" API (https://developers.mailerlite.com), not the
// legacy Classic API (api.mailerlite.com/api/v2, a different auth scheme entirely).
//
// Confirmed live (2026-10-23, AB's own API key): GET /subscribers/{id|email}?include=groups
// returns everything this integration needs in one call — status, account-wide sent/
// opens_count/clicks_count/open_rate/click_rate as plain numbers (not scoped to one
// campaign), and groups: [{id, name, ...}]. There is no separate per-subscriber "activity"
// endpoint needed for this — MailerLite's docs page on campaigns suggested per-campaign
// iteration would be required, but the subscriber resource itself already has the aggregate.

const BASE_URL = 'https://connect.mailerlite.com/api';

function apiKey(): string {
  const key = process.env.MAILERLITE_API_KEY;
  if (!key) throw new Error('MAILERLITE_API_KEY is not set');
  return key;
}

async function mailerliteFetch(path: string): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      Accept: 'application/json',
    },
  });
}

export type MailerLiteSubscriber = {
  id: string;
  status: string;
  sentCount: number;
  opensCount: number;
  openRate: number; // 0-1
  groupNames: string[];
};

type RawGroup = { name: string };
type RawSubscriber = {
  id: string;
  status: string;
  sent?: number;
  opens_count?: number;
  open_rate?: number;
  groups?: RawGroup[];
};

export async function findSubscriberByEmail(email: string): Promise<MailerLiteSubscriber | null> {
  const res = await mailerliteFetch(`/subscribers/${encodeURIComponent(email)}?include=groups`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`MailerLite subscriber lookup failed: ${res.status} ${await res.text()}`);

  const { data } = (await res.json()) as { data: RawSubscriber };
  return {
    id: data.id,
    status: data.status,
    sentCount: data.sent ?? 0,
    opensCount: data.opens_count ?? 0,
    // MailerLite returns this as a whole-number percentage (e.g. 100 for 17/17 opens), not the
    // 0-1 fraction this field's type documents — normalize here so every consumer (the Customer
    // record, the detail page's `* 100` display) can keep treating it as a true fraction.
    openRate: (data.open_rate ?? 0) / 100,
    groupNames: (data.groups ?? []).map((g) => g.name),
  };
}

export type MailerLiteGroup = { name: string; activeCount: number };

// This account has 10 groups today — a single page-1 call, same "small fixed-size set"
// reasoning lib/customer-query.ts already uses for Goliath segments, not a paginated walk.
export async function listGroups(): Promise<MailerLiteGroup[]> {
  const res = await mailerliteFetch('/groups?limit=100');
  if (!res.ok) throw new Error(`MailerLite groups list failed: ${res.status} ${await res.text()}`);

  const { data } = (await res.json()) as { data: { name: string; active_count: number }[] };
  return data.map((g) => ({ name: g.name, activeCount: g.active_count }));
}

// Deep link to a fan's record in MailerLite's own dashboard. MailerLite's docs don't name a
// stable per-subscriber dashboard URL, so — same pattern as userDashboardUrl() in
// lib/goliath.ts — this is driven entirely by an env var template (a full URL containing a
// literal "{id}" placeholder) rather than a guessed path. Returns null, hiding the link, until
// that's set.
export function subscriberDashboardUrl(subscriberId: string): string | null {
  const template = process.env.MAILERLITE_DASHBOARD_SUBSCRIBER_URL_TEMPLATE;
  if (!template) return null;
  return template.replace('{id}', encodeURIComponent(subscriberId));
}
