import { NextResponse } from 'next/server';
import { createPrismaClient } from '../../../../lib/db';
import { iterateAllCustomers } from '../../../../lib/descope-customers';
import { publishJob } from '../../../../lib/qstash';
import { supersedeStaleRun } from '../../../../lib/customer-sync-run';

// 280s, not the platform's full 300s ceiling — leaves headroom to still hit the catch block and
// record a clean "error" before a hard platform kill. Needed because this processes customers
// sequentially (2 Turso round-trips each via findUnique+upsert, plus a QStash publish for
// anything changed) — at a few hundred customers that routinely ran past the previous 60s cap,
// leaving CustomerSyncRun rows stuck in "running" forever (see supersedeStaleRun below).
export const maxDuration = 280;
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// Update the run's processed count this often during the loop, not just at the end — so even if
// this invocation also runs out of time, the row reflects real partial progress instead of a
// stuck "0 processed" with no way to tell it ever did anything.
const PROGRESS_UPDATE_INTERVAL = 50;

const RUN_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30d — bounds table growth, mirrors CronRun

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // no secret configured — reject rather than trust every caller
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

// Pages through every fan profile in the MyAB Descope project (lib/descope-customers), upserts
// the local Customer cache, and enqueues app/api/jobs/sync-customer-external for anything new
// or changed so Shopify enrichment happens off this request path — mirrors
// app/api/cron/process-ingest-jobs's cron + per-item QStash job split. Goliath segment
// membership is refreshed separately by app/api/cron/sync-goliath-segments, since Goliath has
// no per-user read endpoint to call per customer here (see lib/goliath.ts).
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const db = createPrismaClient();
  await supersedeStaleRun(db, 'descope');
  const startedAt = new Date();
  const run = await db.customerSyncRun.create({ data: { source: 'descope', startedAt, status: 'running' } });
  db.customerSyncRun.deleteMany({ where: { startedAt: { lt: new Date(Date.now() - RUN_RETENTION_MS) } } })
    .catch((err) => console.error('[cron/sync-customers] CustomerSyncRun prune failed:', err));

  let processed = 0;
  let changed = 0;
  try {
    for await (const customer of iterateAllCustomers()) {
      const existing = await db.customer.findUnique({
        where: { id: customer.userId },
        select: { email: true, name: true, phone: true, marketingOptIn: true },
      });
      const isChanged =
        !existing ||
        existing.email !== customer.email ||
        existing.name !== customer.name ||
        existing.phone !== customer.phone ||
        existing.marketingOptIn !== customer.marketingOptIn;

      await db.customer.upsert({
        where: { id: customer.userId },
        create: {
          id: customer.userId,
          email: customer.email,
          name: customer.name,
          phone: customer.phone,
          marketingOptIn: customer.marketingOptIn,
          descopeCreatedAt: customer.createdAt,
          descopeSyncedAt: new Date(),
        },
        update: {
          email: customer.email,
          name: customer.name,
          phone: customer.phone,
          marketingOptIn: customer.marketingOptIn,
          descopeSyncedAt: new Date(),
          // descopeCreatedAt is immutable upstream — set once on create, never overwritten
        },
      });

      processed++;
      if (isChanged) {
        changed++;
        await publishJob('/api/jobs/sync-customer-external', { customerId: customer.userId });
      }

      if (processed % PROGRESS_UPDATE_INTERVAL === 0) {
        await db.customerSyncRun.update({ where: { id: run.id }, data: { processed } }).catch(() => {});
      }
    }

    const finishedAt = new Date();
    await db.customerSyncRun.update({ where: { id: run.id }, data: { status: 'success', finishedAt, processed } });
    return NextResponse.json({ status: 'ok', processed, changed });
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
