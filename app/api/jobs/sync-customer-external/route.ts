import { NextResponse } from 'next/server';
import { verifyQstashSignature } from '../../../../lib/qstash';
import { createPrismaClient } from '../../../../lib/db';
import { findCustomerByEmail } from '../../../../lib/shopify';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// QStash job: refreshes one customer's Shopify spend fields. Enqueued by
// app/api/cron/sync-customers whenever a customer is new or its Descope-sourced fields
// changed. Goliath segment membership is refreshed separately, in bulk, by
// app/api/cron/sync-goliath-segments — Goliath's API has no per-user read endpoint to call
// here (see lib/goliath.ts).
export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!(await verifyQstashSignature(request, rawBody))) {
    return NextResponse.json({ message: 'Invalid signature' }, { status: 401 });
  }

  const { customerId } = JSON.parse(rawBody) as { customerId: string };
  if (!customerId) return NextResponse.json({ message: 'customerId is required' }, { status: 400 });

  const db = createPrismaClient();
  try {
    const customer = await db.customer.findUnique({ where: { id: customerId }, select: { email: true, shopifyOrderCount: true } });
    if (!customer) return NextResponse.json({ message: 'Customer not found' }, { status: 404 });

    if (customer.email) {
      try {
        const shopify = await findCustomerByEmail(customer.email);
        await db.customer.update({
          where: { id: customerId },
          data: {
            shopifyCustomerId: shopify?.shopifyCustomerId ?? null,
            shopifyLifetimeSpend: shopify?.lifetimeSpend ?? null,
            shopifyOrderCount: shopify?.orderCount ?? null,
            shopifyLastOrderAt: shopify?.lastOrderAt ?? null,
            shopifySyncedAt: new Date(),
          },
        });

        const newOrders = (shopify?.orderCount ?? 0) - (customer.shopifyOrderCount ?? 0);
        if (shopify && newOrders > 0) {
          await db.customerActivity.create({
            data: {
              customerId,
              type: 'order_placed',
              occurredAt: shopify.lastOrderAt ?? new Date(),
              detail: `${newOrders} new order(s) · lifetime spend now ${shopify.lifetimeSpend.toFixed(2)} DKK`,
            },
          }).catch(() => {});
        }
      } catch (err) {
        // Don't fail the whole job over a Shopify hiccup — the next sync-customers run will
        // re-enqueue this if the Descope-sourced fields change again, and the reconciliation
        // story here is intentionally simpler than the ingest pipeline's since this is just a
        // read-cache refresh, not a user-facing upload.
        console.error(`[jobs/sync-customer-external] Shopify sync failed for ${customerId}:`, err);
      }
    }

    return NextResponse.json({ status: 'ok', customerId });
  } finally {
    await db.$disconnect();
  }
}
