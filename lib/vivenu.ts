// Client for Vivenu's ticketing API (https://docs.vivenu.dev), which AB's EventBilletten
// integration is built on. Confirmed live (2026-10-23, AB's own API key):
//  - GET /customers/{id} — the id is exactly the "eventbillettenUuid" Descope custom attribute
//    (see lib/descope-customers.ts), so every call here is a direct lookup, never an email search.
//  - GET /transactions?customer={id}&status=COMPLETE — real spend/ticket data, matches docs.
//  - Season passes are NOT Vivenu's "Subscription" feature (that's used for an unrelated
//    recurring-membership product, confirmed sparse/empty for real fans) — a season pass is a
//    transaction against an Event with eventType "GROUP" (e.g. "Sæsonkort 2026/27"); a single
//    match is eventType "SINGLE". There is no flag on the transaction itself, so classifying one
//    means resolving its eventId's type — see getEventType()'s DB-backed cache in this file.

import { createHmac, timingSafeEqual } from 'crypto';
import { prisma } from './db';

const BASE_URL = (process.env.VIVENU_API_BASE_URL ?? 'https://vivenu.com/api').replace(/\/$/, '');

function apiKey(): string {
  const key = process.env.VIVENU_API_KEY;
  if (!key) throw new Error('VIVENU_API_KEY is not set');
  return key;
}

async function vivenuFetch(path: string): Promise<Response> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${apiKey()}` },
  });
  if (!res.ok) throw new Error(`Vivenu API ${path} failed: ${res.status} ${await res.text()}`);
  return res;
}

export type VivenuTransaction = {
  id: string;
  status: string;
  realPrice: number;
  eventId: string;
  createdAt: string;
};

// Pages through every COMPLETE transaction for a customer (top maxes at 1,000 per vivenu's
// docs). A club's per-fan transaction count is small (tens, not thousands), so this is a
// straightforward full-sweep per enrichment refresh rather than needing incremental fetching.
export async function listCompleteTransactions(vivenuCustomerId: string): Promise<VivenuTransaction[]> {
  const transactions: VivenuTransaction[] = [];
  let skip = 0;
  const top = 100;
  for (;;) {
    const res = await vivenuFetch(
      `/transactions?customer=${encodeURIComponent(vivenuCustomerId)}&status=COMPLETE&top=${top}&skip=${skip}`
    );
    const data = (await res.json()) as { docs: { _id: string; status: string; realPrice: number; eventId: string; createdAt: string }[]; total: number };
    for (const t of data.docs) {
      transactions.push({ id: t._id, status: t.status, realPrice: t.realPrice, eventId: t.eventId, createdAt: t.createdAt });
    }
    if (skip + data.docs.length >= data.total || data.docs.length === 0) return transactions;
    skip += top;
  }
}

export type VivenuEventType = 'SINGLE' | 'GROUP' | 'RECURRENCE' | 'ROOT';

// DB-backed cache (see prisma/schema.prisma's VivenuEvent) — event type never changes once set,
// and a club's distinct event count across a season is small, so this turns "N transactions
// across M distinct events" into at most M Vivenu API calls total, ever, not per customer.
export async function getEventType(eventId: string): Promise<VivenuEventType> {
  const cached = await prisma.vivenuEvent.findUnique({ where: { id: eventId } });
  if (cached) return cached.eventType as VivenuEventType;

  const res = await vivenuFetch(`/events/${encodeURIComponent(eventId)}`);
  const event = (await res.json()) as { name?: string; eventType: VivenuEventType };
  await prisma.vivenuEvent.upsert({
    where: { id: eventId },
    create: { id: eventId, name: event.name ?? null, eventType: event.eventType },
    update: { name: event.name ?? null, eventType: event.eventType },
  });
  return event.eventType;
}

// Verifies the x-vivenu-signature header on an incoming webhook: HMAC-SHA256 over the raw
// request body, hex-encoded, keyed by the webhook's hmacKey (confirmed against vivenu's own
// "Example Verification Code" — their sample uses a loose string comparison; this uses
// timingSafeEqual instead, matching this codebase's other signature checks, e.g. lib/qstash.ts).
// No hmacKey configured means reject, not trust every caller.
export function verifyVivenuSignature(request: Request, rawBody: string): boolean {
  const hmacKey = process.env.VIVENU_WEBHOOK_HMAC_KEY;
  if (!hmacKey) return false;

  const signature = request.headers.get('x-vivenu-signature');
  if (!signature) return false;

  const expected = createHmac('sha256', hmacKey).update(rawBody).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature.toLowerCase(), 'hex'));
  } catch {
    return false; // mismatched length, or signature header isn't valid hex
  }
}

// Deep link to a fan's record in vivenu's own dashboard. Not documented anywhere in vivenu's
// docs, so — same pattern as userDashboardUrl() in lib/goliath.ts and
// subscriberDashboardUrl() in lib/mailerlite.ts — this is driven entirely by an env var
// template (a full URL containing a literal "{id}" placeholder) rather than a guessed path.
// Returns null, hiding the link, until that's set.
export function customerDashboardUrl(vivenuCustomerId: string): string | null {
  const template = process.env.VIVENU_DASHBOARD_CUSTOMER_URL_TEMPLATE;
  if (!template) return null;
  return template.replace('{id}', encodeURIComponent(vivenuCustomerId));
}

export type VivenuTicket = { customerId: string | null; eventId: string };

// Used by the scan.created webhook handler to resolve which customer a check-in belongs to —
// scans carry ticketId/barcode, not customerId (see app/api/webhooks/vivenu/route.ts).
export async function getTicket(ticketId: string): Promise<VivenuTicket> {
  const res = await vivenuFetch(`/tickets/${encodeURIComponent(ticketId)}`);
  const data = (await res.json()) as { customerId?: string; eventId: string };
  return { customerId: data.customerId ?? null, eventId: data.eventId };
}
