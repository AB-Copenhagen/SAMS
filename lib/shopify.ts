// Thin client for Shopify's Admin REST API — used to enrich a Customer record with spend data.
// Needs a custom-app Admin API access token scoped to read_customers + read_orders.

import { throttle } from './api-throttle';

const API_VERSION = '2024-10';

// Shopify's standard REST Admin API throttle: a 40-request leaky bucket that drains at 2
// requests/second. 550ms spacing keeps sustained use under that drain rate; a few sequential
// calls per customer (search + orders) don't come close to the 40-request burst allowance.
// Needed once app/api/cron/sync-customer-enrichment started calling this for every customer in
// a tight sequential loop, same as lib/mailerlite.ts.
const MIN_INTERVAL_MS = 550;

function storeDomain(): string {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  if (!domain) throw new Error('SHOPIFY_STORE_DOMAIN is not set');
  return domain;
}

function accessToken(): string {
  const token = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
  if (!token) throw new Error('SHOPIFY_ADMIN_API_ACCESS_TOKEN is not set');
  return token;
}

async function shopifyFetch(path: string): Promise<Response> {
  await throttle('shopify', MIN_INTERVAL_MS);
  const res = await fetch(`https://${storeDomain()}/admin/api/${API_VERSION}${path}`, {
    headers: { 'X-Shopify-Access-Token': accessToken() },
  });
  if (!res.ok) throw new Error(`Shopify API ${path} failed: ${res.status} ${await res.text()}`);
  return res;
}

export type ShopifyCustomerSummary = {
  shopifyCustomerId: string;
  lifetimeSpend: number;
  orderCount: number;
  lastOrderAt: Date | null;
};

type ShopifyCustomer = { id: number; orders_count: number; total_spent: string };
type ShopifyOrder = { created_at: string };

export async function findCustomerByEmail(email: string): Promise<ShopifyCustomerSummary | null> {
  const res = await shopifyFetch(`/customers/search.json?query=${encodeURIComponent(`email:${email}`)}`);
  const data = (await res.json()) as { customers: ShopifyCustomer[] };
  const customer = data.customers?.[0];
  if (!customer) return null;

  const lastOrderAt = await getLastOrderDate(customer.id);
  return {
    shopifyCustomerId: String(customer.id),
    lifetimeSpend: parseFloat(customer.total_spent ?? '0'),
    orderCount: customer.orders_count ?? 0,
    lastOrderAt,
  };
}

async function getLastOrderDate(shopifyCustomerId: number): Promise<Date | null> {
  const res = await shopifyFetch(`/customers/${shopifyCustomerId}/orders.json?status=any&limit=1&order=created_at+desc`);
  const data = (await res.json()) as { orders: ShopifyOrder[] };
  const order = data.orders?.[0];
  return order ? new Date(order.created_at) : null;
}

// Deep link to a customer's record in Shopify's unified admin (admin.shopify.com), which
// SHOPIFY_STORE_DOMAIN's ".myshopify.com" handle maps onto directly — the legacy
// "https://{shop}/admin/..." form still redirects here, so this is the canonical one to link to.
// Returns null (rather than throwing, like the fetch helpers above) since this is called from
// page rendering, where a missing env var should just hide the link, not break the page.
export function customerAdminUrl(shopifyCustomerId: string): string | null {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  if (!domain) return null;
  const handle = domain.replace(/\.myshopify\.com$/, '');
  return `https://admin.shopify.com/store/${handle}/customers/${shopifyCustomerId}`;
}
