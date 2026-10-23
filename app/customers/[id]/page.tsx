import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, requireAdmin } from '../../../lib/auth';
import { prisma } from '../../../lib/db';
import AppShell from '../../../components/AppShell';
import { customerAdminUrl } from '../../../lib/shopify';
import { userDashboardUrl } from '../../../lib/goliath';

function segmentNames(json: string | null): string[] {
  if (!json) return [];
  try {
    return JSON.parse(json) as string[];
  } catch {
    return [];
  }
}

function syncedLabel(date: Date | null) {
  return date ? `Synced ${new Date(date).toLocaleString()}` : 'Not yet synced';
}

export default async function CustomerDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = requireAdmin(await getCurrentUser());

  const customer = await prisma.customer.findUnique({ where: { id: params.id } });
  if (!customer) notFound();

  const segments = segmentNames(customer.goliathSegmentsJson);
  const shopifyUrl = customer.shopifyCustomerId ? customerAdminUrl(customer.shopifyCustomerId) : null;
  const goliathUrl = customer.goliathUserId ? userDashboardUrl(customer.goliathUserId) : null;

  return (
    <AppShell user={user}>
      <div className="page-header">
        <div>
          <h1>{customer.name || customer.email || customer.id}</h1>
          <p>{customer.email}</p>
        </div>
        <Link href="/customers" className="asset-link">← Back to customers</Link>
      </div>

      <div className="card">
        <h2>Identity &amp; consent</h2>
        <p>Phone: {customer.phone || '—'}</p>
        <p>
          Marketing consent:{' '}
          {customer.marketingOptIn === null ? 'Unknown' : customer.marketingOptIn ? 'Opted in' : 'Opted out'}
        </p>
        <p>
          Account created: {customer.descopeCreatedAt ? new Date(customer.descopeCreatedAt).toLocaleDateString() : '—'}
        </p>
        <p>
          Last login:{' '}
          {customer.lastLoginAt ? new Date(customer.lastLoginAt).toLocaleString() : '—'}
          {customer.lastLoginIp ? ` from ${customer.lastLoginIp}` : ''}
          {customer.lastLoginCountry ? ` (${customer.lastLoginCountry})` : ''}
        </p>
        <p style={{ color: '#8890b4', fontSize: 12 }}>{syncedLabel(customer.descopeSyncedAt)}</p>
      </div>

      <div className="card">
        <h2>Goliath segments</h2>
        {segments.length > 0 ? (
          <ul>
            {segments.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        ) : (
          <p>No segment membership synced.</p>
        )}
        {goliathUrl && (
          <p>
            <a href={goliathUrl} target="_blank" rel="noopener noreferrer" className="asset-link">
              View in Goliath ↗
            </a>
          </p>
        )}
        <p style={{ color: '#8890b4', fontSize: 12 }}>{syncedLabel(customer.goliathSyncedAt)}</p>
      </div>

      <div className="card">
        <h2>Shopify</h2>
        <p>
          Lifetime spend:{' '}
          {customer.shopifyLifetimeSpend != null ? `${customer.shopifyLifetimeSpend.toFixed(2)} DKK` : '—'}
        </p>
        <p>Orders: {customer.shopifyOrderCount ?? '—'}</p>
        <p>
          Last order:{' '}
          {customer.shopifyLastOrderAt ? new Date(customer.shopifyLastOrderAt).toLocaleDateString() : '—'}
        </p>
        {shopifyUrl && (
          <p>
            <a href={shopifyUrl} target="_blank" rel="noopener noreferrer" className="asset-link">
              View in Shopify ↗
            </a>
          </p>
        )}
        <p style={{ color: '#8890b4', fontSize: 12 }}>{syncedLabel(customer.shopifySyncedAt)}</p>
      </div>
    </AppShell>
  );
}
