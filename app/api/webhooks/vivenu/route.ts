import { NextResponse } from 'next/server';
import { createPrismaClient } from '../../../../lib/db';
import { verifyVivenuSignature, getTicket, getEventType } from '../../../../lib/vivenu';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

type ScanPayload = {
  ticketId: string;
  eventId: string;
  type: 'checkin' | 'checkout';
  scanResult: 'approved' | 'declined';
  time?: string;
};

// Observed live during match-day burst traffic: concurrent check-ins land on this table at once
// and SQLite/libSQL serializes writes, so a handful hit SQLITE_BUSY ("database is locked"). Vivenu
// already retries the delivery on our 502, which recovers these within ~30-60s, but a short
// in-process retry absorbs most of them within the original request instead.
const BUSY_RETRY_DELAYS_MS = [50, 150, 400];

function isSqliteBusy(err: unknown): boolean {
  return err instanceof Error && err.message.includes('SQLITE_BUSY');
}

async function withBusyRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (const delay of BUSY_RETRY_DELAYS_MS) {
    try {
      return await fn();
    } catch (err) {
      if (!isSqliteBusy(err)) throw err;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  return fn();
}

// Receives vivenu's scan.created webhook — the only realistic way to track match attendance,
// since the Scans API has no customerId filter (see lib/vivenu.ts's module comment). Each
// approved check-in at a SINGLE-type event adds that event to the customer's
// vivenuAttendedEventIdsJson (deduped by event, so entry/exit/re-entry scans at the same match
// only count once) and logs a CustomerActivity row.
//
// A ticket with no customerId (guest/unlinked purchase) or no matching local Customer — common
// for away-team, comp, and internal tickets — still gets recorded as a GuestCheckin row rather
// than silently dropped (see gh-62): the scan was a real, approved check-in, just not one that
// can be attributed to a CRM customer.
//
// NOTE: vivenu's docs show the envelope ({id, type, mode, data}) and confirm transaction.complete
// nests its payload under data.transaction, but never showed scan.created's actual data shape.
// This assumes the same data.scan convention and falls back to a flat payload — verify against a
// real delivery once this webhook is registered (see scripts/vivenu-register-webhook.mjs) and
// adjust the `scan` extraction below if vivenu sends something different.
export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifyVivenuSignature(request, rawBody)) {
    return NextResponse.json({ message: 'Invalid signature' }, { status: 401 });
  }

  const envelope = JSON.parse(rawBody) as { type: string; data: Record<string, unknown> };
  // Logged unconditionally (not just on a parse failure) since the data.scan shape below is an
  // assumption, not confirmed against a real delivery — this is the only way to check it once
  // vivenu actually sends one. Safe to remove once that's verified.
  console.log('[webhooks/vivenu] received', envelope.type, JSON.stringify(envelope.data));
  if (envelope.type !== 'scan.created') {
    return NextResponse.json({ status: 'ignored', type: envelope.type });
  }

  const scan = (envelope.data.scan ?? envelope.data) as ScanPayload;
  if (scan.type !== 'checkin' || scan.scanResult !== 'approved') {
    return NextResponse.json({ status: 'ignored', reason: 'not an approved check-in' });
  }

  const db = createPrismaClient();
  try {
    const ticket = await getTicket(scan.ticketId);

    // Only an individual match counts as "attended" — a scan against the season-pass GROUP
    // event itself isn't expected to happen, but ignore rather than miscount if it ever does.
    // Checked before customer resolution, so a non-SINGLE scan is a true no-op, not a guest
    // check-in.
    const eventType = await getEventType(scan.eventId);
    if (eventType !== 'SINGLE') {
      return NextResponse.json({ status: 'ignored', reason: `event type ${eventType}, not SINGLE` });
    }

    const customer = ticket.customerId
      ? await db.customer.findFirst({
          where: { vivenuCustomerId: ticket.customerId },
          select: { id: true, vivenuAttendedEventIdsJson: true },
        })
      : null;

    if (!customer) {
      // upsert, not create: a re-entry scan of the same ticket hits the @unique(ticketId)
      // constraint — keep the first-seen scannedAt rather than erroring or double-counting.
      await withBusyRetry(() =>
        db.guestCheckin.upsert({
          where: { ticketId: scan.ticketId },
          create: { eventId: scan.eventId, ticketId: scan.ticketId, scannedAt: scan.time ? new Date(scan.time) : new Date() },
          update: {},
        })
      );
      return NextResponse.json({ status: 'ok', reason: ticket.customerId ? 'no local customer for this vivenuCustomerId' : 'ticket has no linked customer', guestCheckin: true });
    }

    let attendedEventIds: string[] = [];
    try {
      attendedEventIds = JSON.parse(customer.vivenuAttendedEventIdsJson ?? '[]') as string[];
    } catch {
      attendedEventIds = [];
    }

    if (!attendedEventIds.includes(scan.eventId)) {
      attendedEventIds.push(scan.eventId);
      await withBusyRetry(() =>
        db.customer.update({
          where: { id: customer.id },
          data: {
            vivenuAttendedEventIdsJson: JSON.stringify(attendedEventIds),
            vivenuMatchesAttendedCount: attendedEventIds.length,
          },
        })
      );

      const event = await db.vivenuEvent.findUnique({ where: { id: scan.eventId } });
      await db.customerActivity.create({
        data: {
          customerId: customer.id,
          type: 'match_attended',
          occurredAt: scan.time ? new Date(scan.time) : new Date(),
          detail: event?.name ? `Checked in at ${event.name}` : 'Checked in',
        },
      }).catch(() => {});
    }

    return NextResponse.json({ status: 'ok' });
  } catch (err) {
    // Logged with the scan's identifying fields rather than left as a bare uncaught throw — with
    // no error tracking wired into this app (Vercel logs only), this is the only record of which
    // scan failed. 502 (not 500) signals an upstream/Vivenu-side failure specifically, since
    // Vivenu is expected to retry the delivery on a non-2xx response.
    console.error('[webhooks/vivenu] failed', scan.ticketId, scan.eventId, err);
    return NextResponse.json({ status: 'error', reason: err instanceof Error ? err.message : String(err) }, { status: 502 });
  } finally {
    await db.$disconnect();
  }
}
