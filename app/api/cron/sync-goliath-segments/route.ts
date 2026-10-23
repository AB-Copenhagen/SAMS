import { NextResponse } from 'next/server';
import type { PrismaClient } from '@prisma/client';
import { createPrismaClient } from '../../../../lib/db';
import { listSegments, getSegmentMembers } from '../../../../lib/goliath';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

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
  const startedAt = new Date();
  const run = await db.customerSyncRun.create({ data: { source: 'goliath', startedAt, status: 'running' } });

  try {
    const segments = await listSegments();
    const segmentsByCustomer = new Map<string, string[]>();

    for (const segment of segments) {
      const members = await getSegmentMembers(segment.id);
      for (const member of members) {
        const customerId = member.externalId ?? (await resolveByEmail(db, member.email));
        if (!customerId) continue;
        const list = segmentsByCustomer.get(customerId) ?? [];
        list.push(segment.name);
        segmentsByCustomer.set(customerId, list);
      }
    }

    let processed = 0;
    for (const [customerId, segmentNames] of segmentsByCustomer) {
      await db.customer.updateMany({
        where: { id: customerId },
        data: { goliathSegmentsJson: JSON.stringify(segmentNames), goliathSyncedAt: new Date() },
      });
      processed++;
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
