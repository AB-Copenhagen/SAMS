import { NextResponse } from 'next/server';
import type { PrismaClient } from '@prisma/client';
import { createPrismaClient } from '../../../../lib/db';
import { listSegments, getSegmentMembers } from '../../../../lib/goliath';
import { supersedeStaleRun } from '../../../../lib/customer-sync-run';

// See app/api/cron/sync-customers' comment on the same constant — same risk (a platform kill
// mid-run can't be caught, leaving the CustomerSyncRun stuck in "running") once this club has
// enough segments/members for the per-segment API calls and matching below to take a while.
export const maxDuration = 280;
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const PROGRESS_UPDATE_INTERVAL = 50;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

async function resolveByEmail(db: PrismaClient, email: string | null): Promise<string | null> {
  if (!email) return null;
  const customer = await db.customer.findFirst({ where: { email }, select: { id: true } });
  return customer?.id ?? null;
}

// Goliath has no per-user "get profile" endpoint (see lib/goliath.ts) — only segment
// membership lists. So instead of refreshing one customer at a time like sync-customers does
// for Shopify, this walks every segment, matches each member back to a local Customer by
// Goliath's own externalId (the Descope userId, since Goliath logs users in through Descope)
// or by email as a fallback, and records which segments that customer currently belongs to.
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const db = createPrismaClient();
  await supersedeStaleRun(db, 'goliath');
  const startedAt = new Date();
  const run = await db.customerSyncRun.create({ data: { source: 'goliath', startedAt, status: 'running' } });

  try {
    const segments = await listSegments();
    const segmentsByCustomer = new Map<string, { segmentNames: string[]; goliathUserId: string }>();

    for (const segment of segments) {
      const members = await getSegmentMembers(segment.id);
      for (const member of members) {
        const customerId = member.externalId ?? (await resolveByEmail(db, member.email));
        if (!customerId) continue;
        const entry = segmentsByCustomer.get(customerId) ?? { segmentNames: [], goliathUserId: member.goliathUserId };
        entry.segmentNames.push(segment.name);
        segmentsByCustomer.set(customerId, entry);
      }
    }

    // Fetched up front so each customer's previous segments are known before they're
    // overwritten below — needed to log a segments_changed activity only on a real diff, not
    // every routine resync.
    const previousByCustomer = new Map<string, string | null>();
    if (segmentsByCustomer.size > 0) {
      const existing = await db.customer.findMany({
        where: { id: { in: [...segmentsByCustomer.keys()] } },
        select: { id: true, goliathSegmentsJson: true },
      });
      for (const c of existing) previousByCustomer.set(c.id, c.goliathSegmentsJson);
    }

    let processed = 0;
    for (const [customerId, { segmentNames, goliathUserId }] of segmentsByCustomer) {
      await db.customer.updateMany({
        where: { id: customerId },
        data: { goliathUserId, goliathSegmentsJson: JSON.stringify(segmentNames), goliathSyncedAt: new Date() },
      });

      const previous = (() => {
        try { return JSON.parse(previousByCustomer.get(customerId) ?? '[]') as string[]; } catch { return []; }
      })();
      const added = segmentNames.filter((n) => !previous.includes(n));
      const removed = previous.filter((n) => !segmentNames.includes(n));
      if (added.length > 0 || removed.length > 0) {
        const parts = [added.length > 0 ? `+${added.join(', ')}` : null, removed.length > 0 ? `-${removed.join(', ')}` : null];
        await db.customerActivity.create({
          data: { customerId, type: 'segments_changed', occurredAt: new Date(), detail: parts.filter(Boolean).join(' · ') },
        }).catch(() => {});
      }

      processed++;
      if (processed % PROGRESS_UPDATE_INTERVAL === 0) {
        await db.customerSyncRun.update({ where: { id: run.id }, data: { processed } }).catch(() => {});
      }
    }

    const finishedAt = new Date();
    await db.customerSyncRun.update({ where: { id: run.id }, data: { status: 'success', finishedAt, processed } });
    return NextResponse.json({ status: 'ok', segments: segments.length, customersMatched: processed });
  } catch (err) {
    const finishedAt = new Date();
    await db.customerSyncRun.update({
      where: { id: run.id },
      data: { status: 'error', finishedAt, errorMessage: err instanceof Error ? err.message : String(err) },
    });
    return NextResponse.json({ message: 'Sync failed' }, { status: 500 });
  } finally {
    await db.$disconnect();
  }
}
