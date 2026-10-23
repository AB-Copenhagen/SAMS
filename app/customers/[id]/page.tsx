import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, isAdmin } from '../../../lib/auth';
import { prisma } from '../../../lib/db';
import AppShell from '../../../components/AppShell';

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
  const user = await getCurrentUser();
  if (!isAdmin(user)) redirect('/login');

  const customer = await prisma.customer.findUnique({ where: { id: params.id } });
  if (!customer) notFound();

  const segments = segmentNames(customer.goliathSegmentsJson);

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
        <p style={{ color: '#8890b4', fontSize: 12 }}>{syncedLabel(customer.shopifySyncedAt)}</p>
      </div>
    </AppShell>
  );
}
