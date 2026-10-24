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

// Receives vivenu's scan.created webhook — the only realistic way to track match attendance,
// since the Scans API has no customerId filter (see lib/vivenu.ts's module comment). Each
// approved check-in at a SINGLE-type event adds that event to the customer's
// vivenuAttendedEventIdsJson (deduped by event, so entry/exit/re-entry scans at the same match
// only count once) and logs a CustomerActivity row.
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
    if (!ticket.customerId) {
      return NextResponse.json({ status: 'ignored', reason: 'ticket has no linked customer' });
    }

    const customer = await db.customer.findFirst({
      where: { vivenuCustomerId: ticket.customerId },
      select: { id: true, vivenuAttendedEventIdsJson: true },
    });
    if (!customer) {
      return NextResponse.json({ status: 'ignored', reason: 'no local customer for this vivenuCustomerId' });
    }

    // Only an individual match counts as "attended" — a scan against the season-pass GROUP
    // event itself isn't expected to happen, but ignore rather than miscount if it ever does.
    const eventType = await getEventType(scan.eventId);
    if (eventType !== 'SINGLE') {
      return NextResponse.json({ status: 'ignored', reason: `event type ${eventType}, not SINGLE` });
    }

    let attendedEventIds: string[] = [];
    try {
      attendedEventIds = JSON.parse(customer.vivenuAttendedEventIdsJson ?? '[]') as string[];
    } catch {
      attendedEventIds = [];
    }

    if (!attendedEventIds.includes(scan.eventId)) {
      attendedEventIds.push(scan.eventId);
      await db.customer.update({
        where: { id: customer.id },
        data: {
          vivenuAttendedEventIdsJson: JSON.stringify(attendedEventIds),
          vivenuMatchesAttendedCount: attendedEventIds.length,
        },
      });

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
  } finally {
    await db.$disconnect();
  }
}
