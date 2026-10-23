import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, isAdmin } from '../../lib/auth';
import { prisma } from '../../lib/db';
import AppShell from '../../components/AppShell';
import { buildCustomerWhere } from '../../lib/customer-query';

const PER_PAGE = 50;

function segmentNames(json: string | null): string[] {
  if (!json) return [];
  try {
    return JSON.parse(json) as string[];
  } catch {
    return [];
  }
}

export default async function CustomersPage(
  props: { searchParams: Promise<{ page?: string; q?: string; marketingOptIn?: string }> }
) {
  const searchParams = await props.searchParams;
  const user = await getCurrentUser();
  if (!isAdmin(user)) redirect('/login');

  const page = Math.max(1, parseInt(searchParams.page ?? '1') || 1);
  const q = searchParams.q ?? '';
  const marketingOptIn =
    searchParams.marketingOptIn === 'true' ? true : searchParams.marketingOptIn === 'false' ? false : undefined;
  const where = buildCustomerWhere({ q: q || undefined, marketingOptIn });

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({ where, orderBy: { updatedAt: 'desc' }, take: PER_PAGE, skip: (page - 1) * PER_PAGE }),
    prisma.customer.count({ where }),
  ]);

  const pages = Math.ceil(total / PER_PAGE) || 1;

  function pageUrl(p: number) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (marketingOptIn !== undefined) params.set('marketingOptIn', String(marketingOptIn));
    if (p > 1) params.set('page', String(p));
    const qs = params.toString();
    return '/customers' + (qs ? `?${qs}` : '');
  }

  return (
    <AppShell user={user}>
      <div className="page-header">
        <div>
          <h1>Customers</h1>
          <p>Unified fan record — Descope identity, Goliath segments, Shopify spend.</p>
        </div>
      </div>

      <form method="get" className="card" style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 16 }}>
        <input
          type="text"
          name="q"
          placeholder="Search name or email"
          defaultValue={q}
          style={{ flex: 1, padding: '8px 10px' }}
        />
        <select name="marketingOptIn" defaultValue={marketingOptIn === undefined ? '' : String(marketingOptIn)}>
          <option value="">All consent</option>
          <option value="true">Opted in</option>
          <option value="false">Opted out</option>
        </select>
        <button className="btn-primary" type="submit">Search</button>
      </form>

      <div className="card" style={{ padding: 0 }}>
        {customers.length === 0 ? (
          <div style={{ padding: '48px 32px', textAlign: 'center', color: '#8890b4' }}>
            No customers synced yet — the sync cron (/api/cron/sync-customers) populates this table.
          </div>
        ) : (
          <div className="asset-table-wrap">
            <table className="asset-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Consent</th>
                  <th>Goliath segments</th>
                  <th>Lifetime spend</th>
                  <th>Last synced</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id}>
                    <td style={{ fontWeight: 500 }}>
                      <Link href={`/customers/${customer.id}`} className="asset-link">
                        {customer.name || '—'}
                      </Link>
                    </td>
                    <td>{customer.email || '—'}</td>
                    <td>
                      {customer.marketingOptIn === null ? '—' : customer.marketingOptIn ? 'Opted in' : 'Opted out'}
                    </td>
                    <td style={{ color: '#6b7491', fontSize: 12 }}>
                      {segmentNames(customer.goliathSegmentsJson).join(', ') || '—'}
                    </td>
                    <td>
                      {customer.shopifyLifetimeSpend != null ? `${customer.shopifyLifetimeSpend.toFixed(2)} DKK` : '—'}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', color: '#8890b4' }}>
                      {customer.updatedAt ? new Date(customer.updatedAt).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {customers.length > 0 && (
        <div className="pagination">
          <a
            href={pageUrl(page - 1)}
            className="btn-secondary"
            style={{ pointerEvents: page <= 1 ? 'none' : 'auto', opacity: page <= 1 ? 0.4 : 1, textDecoration: 'none' }}
          >
            ← Prev
          </a>
          <span className="page-info">Page {page} of {pages} · {total} total</span>
          <a
            href={pageUrl(page + 1)}
            className="btn-secondary"
            style={{ pointerEvents: page >= pages ? 'none' : 'auto', opacity: page >= pages ? 0.4 : 1, textDecoration: 'none' }}
          >
            Next →
          </a>
        </div>
      )}
    </AppShell>
  );
}
