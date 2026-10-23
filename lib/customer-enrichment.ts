// Shopify + MailerLite enrichment for a single customer, fetched lazily when their detail page
// is viewed rather than eagerly for every customer on every Descope sync.
//
// Why: app/api/cron/sync-customers used to enqueue this (via QStash) for every new/changed
// customer on every run — at a few hundred customers, most of whom have never bought anything
// on Shopify, that fan-out was a real contributor to the cron timing out (see the comment on
// requireAdmin-era maxDuration bump). Shopify/MailerLite coverage was already going to be
// partial no matter when it's fetched (not every fan is a Shopify customer or MailerLite
// subscriber), so there's no completeness lost by only refreshing a customer's data when an
// admin actually opens their record — only a slower first load per customer per TTL window.

import { prisma } from './db';
import { findCustomerByEmail } from './shopify';
import { findSubscriberByEmail } from './mailerlite';

const EXTERNAL_DATA_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export function isExternalDataStale(syncedAt: Date | null): boolean {
  if (!syncedAt) return true;
  return Date.now() - syncedAt.getTime() > EXTERNAL_DATA_TTL_MS;
}

export type ExternalDataFields = {
  shopifyCustomerId: string | null;
  shopifyLifetimeSpend: number | null;
  shopifyOrderCount: number | null;
  shopifyLastOrderAt: Date | null;
  shopifySyncedAt: Date;
  mailerliteSubscriberId: string | null;
  mailerliteStatus: string | null;
  mailerliteGroupsJson: string | null;
  mailerliteSentCount: number | null;
  mailerliteOpensCount: number | null;
  mailerliteOpenRate: number | null;
  mailerliteSyncedAt: Date;
};

// Fetches fresh Shopify + MailerLite data, writes it to the Customer row, logs an activity
// row on a real change, and returns the fields it wrote so the caller (the detail page) can
// use them immediately without a second DB read. Each platform is independently try/caught —
// a Shopify hiccup shouldn't block MailerLite refreshing or vice versa, same as when this lived
// in the QStash job it replaced.
export async function refreshCustomerExternalData(customer: {
  id: string;
  email: string | null;
  shopifyOrderCount: number | null;
  mailerliteStatus: string | null;
}): Promise<Partial<ExternalDataFields>> {
  if (!customer.email) return {};
  const updates: Partial<ExternalDataFields> = {};

  try {
    const shopify = await findCustomerByEmail(customer.email);
    const shopifyFields: Partial<ExternalDataFields> = {
      shopifyCustomerId: shopify?.shopifyCustomerId ?? null,
      shopifyLifetimeSpend: shopify?.lifetimeSpend ?? null,
      shopifyOrderCount: shopify?.orderCount ?? null,
      shopifyLastOrderAt: shopify?.lastOrderAt ?? null,
      shopifySyncedAt: new Date(),
    };
    await prisma.customer.update({ where: { id: customer.id }, data: shopifyFields });
    Object.assign(updates, shopifyFields);

    const newOrders = (shopify?.orderCount ?? 0) - (customer.shopifyOrderCount ?? 0);
    if (shopify && newOrders > 0) {
      await prisma.customerActivity.create({
        data: {
          customerId: customer.id,
          type: 'order_placed',
          occurredAt: shopify.lastOrderAt ?? new Date(),
          detail: `${newOrders} new order(s) · lifetime spend now ${shopify.lifetimeSpend.toFixed(2)} DKK`,
        },
      }).catch(() => {});
    }
  } catch (err) {
    // Don't fail the whole refresh over a Shopify hiccup — the next stale view will retry.
    console.error(`[customer-enrichment] Shopify refresh failed for ${customer.id}:`, err);
  }

  try {
    const subscriber = await findSubscriberByEmail(customer.email);
    const mailerliteFields: Partial<ExternalDataFields> = {
      mailerliteSubscriberId: subscriber?.id ?? null,
      mailerliteStatus: subscriber?.status ?? null,
      mailerliteGroupsJson: subscriber ? JSON.stringify(subscriber.groupNames) : null,
      mailerliteSentCount: subscriber?.sentCount ?? null,
      mailerliteOpensCount: subscriber?.opensCount ?? null,
      mailerliteOpenRate: subscriber?.openRate ?? null,
      mailerliteSyncedAt: new Date(),
    };
    await prisma.customer.update({ where: { id: customer.id }, data: mailerliteFields });
    Object.assign(updates, mailerliteFields);

    if (customer.mailerliteStatus && subscriber && customer.mailerliteStatus !== subscriber.status) {
      await prisma.customerActivity.create({
        data: {
          customerId: customer.id,
          type: 'mailerlite_status_changed',
          occurredAt: new Date(),
          detail: `MailerLite: ${customer.mailerliteStatus} → ${subscriber.status}`,
        },
      }).catch(() => {});
    }
  } catch (err) {
    console.error(`[customer-enrichment] MailerLite refresh failed for ${customer.id}:`, err);
  }

  return updates;
}
