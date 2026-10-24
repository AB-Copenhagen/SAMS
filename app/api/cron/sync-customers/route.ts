import { NextResponse } from 'next/server';
import { createPrismaClient } from '../../../../lib/db';
import { iterateAllCustomers, CUSTOMER_PAGE_SIZE } from '../../../../lib/descope-customers';
import { supersedeStaleRun } from '../../../../lib/customer-sync-run';

const RESUME_CURSOR_KEY = 'descope-customers-resume-page';

// 800s — the Pro-plan generally-available ceiling (confirmed via a real 504 at exactly the old
// 280s: maxDuration IS the platform's kill point, not a buffer below some higher ceiling — a
// hard timeout kill can't be caught, so the catch block below never actually runs on a timeout
// regardless of how much headroom is left under it; supersedeStaleRun (below) is what recovers
// a run stuck "running" from a kill, not this). This processes customers sequentially (2 Turso
// round-trips each via findUnique+upsert) — at ~170ms/customer and ~4,100 users in the MyAB
// project, a full sweep needs ~700s, which fits in one run at 800s instead of requiring several
// laps via the resume cursor below (still in place as the safety net if the population or
// per-customer latency grows past what one run can finish). This used to also enqueue a QStash
// job per changed customer for Shopify/MailerLite enrichment, which was a major contributor to
// the timeout before this — that enrichment is now fetched lazily on a customer's detail page
// view instead, with a TTL cache (see lib/customer-enrichment.ts).
export const maxDuration = 800;
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

// Pages through every fan profile in the MyAB Descope project (lib/descope-customers) and
// upserts the local Customer cache. Shopify/MailerLite enrichment is fetched lazily per
// customer on detail-page view instead of eagerly here (see lib/customer-enrichment.ts).
// Goliath segment membership is refreshed separately by app/api/cron/sync-goliath-segments,
// since Goliath has no per-user read endpoint to call per customer here (see lib/goliath.ts).
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const db = createPrismaClient();
  await supersedeStaleRun(db, 'descope');
  const startedAt = new Date();
  const run = await db.customerSyncRun.create({ data: { source: 'descope', startedAt, status: 'running' } });
  db.customerSyncRun.deleteMany({ where: { startedAt: { lt: new Date(Date.now() - RUN_RETENTION_MS) } } })
    .catch((err) => console.error('[cron/sync-customers] CustomerSyncRun prune failed:', err));

  const cursor = await db.syncState.findUnique({ where: { key: RESUME_CURSOR_KEY } });
  const startPage = cursor ? parseInt(cursor.value, 10) || 0 : 0;

  let processed = 0;
  let changed = 0;
  try {
    for await (const customer of iterateAllCustomers(startPage)) {
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
          vivenuCustomerId: customer.vivenuCustomerId,
          descopeCreatedAt: customer.createdAt,
          descopeSyncedAt: new Date(),
        },
        update: {
          email: customer.email,
          name: customer.name,
          phone: customer.phone,
          marketingOptIn: customer.marketingOptIn,
          vivenuCustomerId: customer.vivenuCustomerId,
          // Also written on update, not just create: the value itself is immutable upstream
          // (Descope's createdTime for a user never changes), so re-setting it every run is a
          // no-op for already-correct rows and self-heals any customer whose local row predates
          // this field existing — no separate backfill needed.
          descopeCreatedAt: customer.createdAt,
          descopeSyncedAt: new Date(),
        },
      });

      processed++;
      if (isChanged) changed++;

      // Only a real flip on an existing customer counts as a "change" worth logging — a brand
      // new customer's initial value (no `existing` row) isn't one.
      if (existing && existing.marketingOptIn !== customer.marketingOptIn) {
        await db.customerActivity.create({
          data: {
            customerId: customer.userId,
            type: 'consent_changed',
            occurredAt: new Date(),
            detail: customer.marketingOptIn === null
              ? 'Marketing consent cleared'
              : customer.marketingOptIn ? 'Opted in to marketing' : 'Opted out of marketing',
          },
        }).catch(() => {});
      }

      if (processed % PROGRESS_UPDATE_INTERVAL === 0) {
        await db.customerSyncRun.update({ where: { id: run.id }, data: { processed } }).catch(() => {});
        // Checkpoint the resume cursor periodically, not just at the end — a timeout kill can't
        // be caught, so whatever was last persisted here is what the next run resumes from.
        const resumePage = startPage + Math.floor(processed / CUSTOMER_PAGE_SIZE);
        await db.syncState.upsert({
          where: { key: RESUME_CURSOR_KEY },
          create: { key: RESUME_CURSOR_KEY, value: String(resumePage) },
          update: { value: String(resumePage) },
        }).catch(() => {});
      }
    }

    // Reached the end of the Descope list without timing out — reset the cursor so the next
    // run starts a fresh full lap (picks up brand-new signups and re-checks already-synced
    // customers for changed fields) instead of resuming from near the end forever.
    await db.syncState.upsert({
      where: { key: RESUME_CURSOR_KEY },
      create: { key: RESUME_CURSOR_KEY, value: '0' },
      update: { value: '0' },
    }).catch(() => {});

    const finishedAt = new Date();
    await db.customerSyncRun.update({ where: { id: run.id }, data: { status: 'success', finishedAt, processed } });
    return NextResponse.json({ status: 'ok', processed, changed, startPage });
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
