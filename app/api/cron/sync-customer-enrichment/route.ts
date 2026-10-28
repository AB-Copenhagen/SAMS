import { NextResponse } from 'next/server';
import { createPrismaClient } from '../../../../lib/db';
import { supersedeStaleRun } from '../../../../lib/customer-sync-run';
import { refreshCustomerExternalData } from '../../../../lib/customer-enrichment';

const RESUME_CURSOR_KEY = 'customer-enrichment-resume-offset';
const DB_PAGE_SIZE = 500;
const PROGRESS_UPDATE_INTERVAL = 25;

// 800s — the Pro-plan generally-available ceiling (see app/api/cron/sync-customers for the full
// writeup on why this is the real kill point, not a buffer under a higher one).
export const maxDuration = 800;
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

// Backfills Shopify/MailerLite/Vivenu/Goliath enrichment for every customer, not just the ones
// an admin has individually opened. refreshCustomerExternalData (lib/customer-enrichment.ts) was
// only ever called lazily on a customer's detail-page view — which meant /customers/list's Shopify
// Spend and # of Tickets columns stayed empty for virtually the entire ~4,100-customer base,
// since almost none of them had ever had their detail page opened. This reuses that exact same
// function (not a duplicate implementation) so the per-platform staleness gating stays in one
// place — it's a near-instant no-op for any customer whose data is already fresh within its 24h
// TTL, so after the first full backfill this mostly just confirms freshness rather than making
// real API calls. Same resume-cursor pattern as app/api/cron/sync-customers: external API calls
// (Shopify + Vivenu, sequential per customer) are far slower than that cron's local-DB-only
// loop, so a from-scratch backfill across ~4,100 customers won't fit in one 800s run.
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const db = createPrismaClient();
  await supersedeStaleRun(db, 'customer-enrichment');
  const startedAt = new Date();
  const run = await db.customerSyncRun.create({ data: { source: 'customer-enrichment', startedAt, status: 'running' } });

  const cursor = await db.syncState.findUnique({ where: { key: RESUME_CURSOR_KEY } });
  let offset = cursor ? parseInt(cursor.value, 10) || 0 : 0;
  const startOffset = offset;

  let processed = 0;
  try {
    for (;;) {
      const batch = await db.customer.findMany({
        orderBy: { id: 'asc' },
        skip: offset,
        take: DB_PAGE_SIZE,
        select: {
          id: true,
          email: true,
          goliathUserId: true,
          goliathSyncedAt: true,
          shopifyOrderCount: true,
          shopifySyncedAt: true,
          mailerliteStatus: true,
          mailerliteSyncedAt: true,
          vivenuCustomerId: true,
          vivenuMatchesPurchasedCount: true,
          vivenuSeasonPassStatus: true,
          vivenuSyncedAt: true,
        },
      });
      if (batch.length === 0) break;

      for (const customer of batch) {
        await refreshCustomerExternalData(customer);
        processed++;
        offset++;

        if (processed % PROGRESS_UPDATE_INTERVAL === 0) {
          await db.customerSyncRun.update({ where: { id: run.id }, data: { processed } }).catch(() => {});
          await db.syncState.upsert({
            where: { key: RESUME_CURSOR_KEY },
            create: { key: RESUME_CURSOR_KEY, value: String(offset) },
            update: { value: String(offset) },
          }).catch(() => {});
        }
      }
    }

    // Reached the end of the customer list without timing out — reset the cursor so the next
    // run starts a fresh lap (re-checks everyone's staleness) instead of resuming from the end.
    await db.syncState.upsert({
      where: { key: RESUME_CURSOR_KEY },
      create: { key: RESUME_CURSOR_KEY, value: '0' },
      update: { value: '0' },
    }).catch(() => {});

    const finishedAt = new Date();
    await db.customerSyncRun.update({ where: { id: run.id }, data: { status: 'success', finishedAt, processed } });
    return NextResponse.json({ status: 'ok', processed, startOffset });
  } catch (err) {
    const finishedAt = new Date();
    await db.customerSyncRun.update({
      where: { id: run.id },
      data: { status: 'error', finishedAt, processed, errorMessage: err instanceof Error ? err.message : String(err) },
    });
    return NextResponse.json({ message: 'Sync failed' }, { status: 500 });
  } finally {
    await db.$disconnect();
  }
}
