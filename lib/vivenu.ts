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

export type VivenuMatch = { id: string; name: string; start: string };

// Confirmed live: GET /events (no id) is a real list endpoint — {rows, total} — distinct from
// GET /events/{id} used by getEventType above. AB's whole account only has 19 events total, so
// this is one cheap call, not something that needs its own cache table like VivenuEvent does.
//
// Vivenu has no event "category" distinguishing an actual match from other SINGLE-type ticketed
// products on the same account (confirmed live: "MyAB Membership" and a non-match "SOCIAL OWLS
// KICK OFF" event are both eventType SINGLE too) — this filters by the name pattern every real
// match in the sample follows ("AB vs X" / "AB mod X"), which is a heuristic, not a real field.
// Revisit if a differently-named match ever gets miscategorized.
const MATCH_NAME_PATTERN = /\bAB\s+(vs|mod)\b/i;

export async function listMatches(): Promise<VivenuMatch[]> {
  const res = await vivenuFetch('/events?top=100');
  const data = (await res.json()) as { rows: { _id: string; name: string; eventType: VivenuEventType; start: string }[] };
  return data.rows
    .filter((e) => e.eventType === 'SINGLE' && MATCH_NAME_PATTERN.test(e.name))
    .map((e) => ({ id: e._id, name: e.name, start: e.start }));
}

// Ticket sales are queryable per event directly (confirmed live), unlike check-ins — see the
// module comment on getTicket below for why attendance can't be read the same way.
export async function getTicketsSoldCount(eventId: string): Promise<number> {
  const res = await vivenuFetch(`/tickets?event=${encodeURIComponent(eventId)}&status=VALID&top=1`);
  const data = (await res.json()) as { total: number };
  return data.total;
}

export type VivenuTicket = { customerId: string | null; eventId: string };

// Used by the scan.created webhook handler to resolve which customer a check-in belongs to —
// scans carry ticketId/barcode, not customerId (see app/api/webhooks/vivenu/route.ts).
//
// There's no equivalent "query check-ins directly" option to fall back on if the webhook isn't
// enough: confirmed live that GET /scans (portier.vivenu.com) rejects the main account API key
// outright ("Missing authentication", not just a 403) — it appears to need a separate
// device/scanner-scoped credential that isn't documented and that we don't have. So aggregate
// attendance (e.g. per-match check-in counts) can only ever be as complete as what scan.created
// has delivered since the webhook went live — there's no way to backfill or spot-check it
// against Vivenu's own historical scan data with what we have today.
export async function getTicket(ticketId: string): Promise<VivenuTicket> {
  const res = await vivenuFetch(`/tickets/${encodeURIComponent(ticketId)}`);
  const data = (await res.json()) as { customerId?: string; eventId: string };
  return { customerId: data.customerId ?? null, eventId: data.eventId };
}
