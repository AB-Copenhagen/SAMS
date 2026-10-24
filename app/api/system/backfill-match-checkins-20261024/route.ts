import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';
import { getTicket, getEventType } from '../../../../lib/vivenu';
import tickets from './tickets.json';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// One-shot: backfills the 2026-10-24 match's check-ins (gh-62). The scan.created webhook was
// live and delivering correctly that day (241 deliveries, 0 errors — see the gh-62 investigation),
// but at the time it ran, any scan whose ticket had no linkable Customer was silently dropped
// instead of being recorded as a GuestCheckin. This replays the same resolution logic
// (getTicket -> customerId -> Customer match -> attendance update, else GuestCheckin) over the
// 234 unique tickets captured from that match's webhook logs (tickets.json), so today's numbers
// reflect the same accounting the webhook now does for every match going forward.
//
// Idempotent: uses the same "already in attendedEventIds" / GuestCheckin-upsert-on-ticketId
// guards as the live webhook, so running this more than once, or after the webhook has already
// processed some of these tickets, doesn't double-count anything.
//
// Call from an authenticated ADMIN session, e.g. in the browser console on the deployed app:
//   fetch('/api/system/backfill-match-checkins-20261024', { method: 'POST' }).then(r => r.json()).then(console.log)
export async function POST() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  let attendedUpdated = 0;
  let alreadyCounted = 0;
  let guestRecorded = 0;
  let skippedNonSingleEvent = 0;
  const errors: { ticketId: string; message: string }[] = [];

  for (const { ticketId, eventId, scannedAt } of tickets as { ticketId: string; eventId: string; scannedAt: string }[]) {
    try {
      const eventType = await getEventType(eventId);
      if (eventType !== 'SINGLE') {
        skippedNonSingleEvent++;
        continue;
      }

      const ticket = await getTicket(ticketId);
      const customer = ticket.customerId
        ? await prisma.customer.findFirst({
            where: { vivenuCustomerId: ticket.customerId },
            select: { id: true, vivenuAttendedEventIdsJson: true },
          })
        : null;

      if (!customer) {
        const existing = await prisma.guestCheckin.findUnique({ where: { ticketId } });
        if (!existing) {
          await prisma.guestCheckin.create({ data: { eventId, ticketId, scannedAt: new Date(scannedAt) } });
          guestRecorded++;
        }
        continue;
      }

      let attendedEventIds: string[] = [];
      try {
        attendedEventIds = JSON.parse(customer.vivenuAttendedEventIdsJson ?? '[]') as string[];
      } catch {
        attendedEventIds = [];
      }

      if (attendedEventIds.includes(eventId)) {
        alreadyCounted++;
        continue;
      }

      attendedEventIds.push(eventId);
      await prisma.customer.update({
        where: { id: customer.id },
        data: {
          vivenuAttendedEventIdsJson: JSON.stringify(attendedEventIds),
          vivenuMatchesAttendedCount: attendedEventIds.length,
        },
      });

      const event = await prisma.vivenuEvent.findUnique({ where: { id: eventId } });
      await prisma.customerActivity.create({
        data: {
          customerId: customer.id,
          type: 'match_attended',
          occurredAt: new Date(scannedAt),
          detail: event?.name ? `Checked in at ${event.name}` : 'Checked in',
        },
      }).catch(() => {});

      attendedUpdated++;
    } catch (err) {
      errors.push({ ticketId, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({
    ok: true,
    total: tickets.length,
    attendedUpdated,
    alreadyCounted,
    guestRecorded,
    skippedNonSingleEvent,
    errors,
  });
}
