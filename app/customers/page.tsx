import Link from 'next/link';
import { getCurrentUser, requireAdmin } from '../../lib/auth';
import { prisma } from '../../lib/db';
import { getCachedStaffPreferences, resolvePageSize } from '../../lib/staff-preferences';
import AppShell from '../../components/AppShell';
import { buildCustomerWhere, listDistinctGoliathSegments } from '../../lib/customer-query';

const DEFAULT_PER_PAGE = 50;

function segmentNames(json: string | null): string[] {
  if (!json) return [];
  try {
    return JSON.parse(json) as string[];
  } catch {
    return [];
  }
}

export default async function CustomersPage(
  props: {
    searchParams: Promise<{
      page?: string;
      q?: string;
      marketingOptIn?: string;
      minSpend?: string;
      segment?: string;
    }>;
  }
) {
  const searchParams = await props.searchParams;
  const user = requireAdmin(await getCurrentUser());
  const pref = await getCachedStaffPreferences(user.id);
  const PER_PAGE = resolvePageSize(pref, DEFAULT_PER_PAGE);

  const page = Math.max(1, parseInt(searchParams.page ?? '1') || 1);
  const q = searchParams.q ?? '';
  const marketingOptIn =
    searchParams.marketingOptIn === 'true' ? true : searchParams.marketingOptIn === 'false' ? false : undefined;
  const minSpend = searchParams.minSpend ? Number(searchParams.minSpend) : undefined;
  const segment = searchParams.segment || undefined;
  const where = buildCustomerWhere({ q: q || undefined, marketingOptIn, minSpend, segment });

  const [customers, total, segmentOptions] = await Promise.all([
    prisma.customer.findMany({ where, orderBy: { updatedAt: 'desc' }, take: PER_PAGE, skip: (page - 1) * PER_PAGE }),
    prisma.customer.count({ where }),
    listDistinctGoliathSegments(),
  ]);

  const pages = Math.ceil(total / PER_PAGE) || 1;

  function pageUrl(p: number) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (marketingOptIn !== undefined) params.set('marketingOptIn', String(marketingOptIn));
    if (minSpend !== undefined) params.set('minSpend', String(minSpend));
    if (segment) params.set('segment', segment);
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
        <select name="segment" defaultValue={segment ?? ''}>
          <option value="">All segments</option>
          {segmentOptions.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <input
          type="number"
          name="minSpend"
          placeholder="Min spend (DKK)"
          defaultValue={minSpend ?? ''}
          style={{ width: 150, padding: '8px 10px' }}
        />
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
                  <th>Last login</th>
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
                      {customer.lastLoginAt
                        ? `${new Date(customer.lastLoginAt).toLocaleString()}${customer.lastLoginCountry ? ` (${customer.lastLoginCountry})` : ''}`
                        : '—'}
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
