import Link from 'next/link';
import { getCurrentUser, requireStaff } from '../../../lib/auth';
import { prisma } from '../../../lib/db';
import { getCachedStaffPreferences, resolvePageSize } from '../../../lib/staff-preferences';
import AppShell from '../../../components/AppShell';
import { buildCustomerWhere, topGoliathSegments } from '../../../lib/customer-query';
import { avatarColor, avatarInitial, formatSpend } from '../../../lib/customer-ui';

const DEFAULT_PER_PAGE = 50;

function consentBadge(marketingOptIn: boolean | null) {
  if (marketingOptIn === null) return <span className="consent-badge badge-opted-unknown">UNKNOWN</span>;
  return marketingOptIn
    ? <span className="consent-badge badge-opted-in">OPTED IN</span>
    : <span className="consent-badge badge-opted-out">OPTED OUT</span>;
}

type SortField = 'consent' | 'spend' | 'tickets';
const SORT_COLUMNS: Record<SortField, string> = {
  consent: 'marketingOptIn',
  spend: 'shopifyLifetimeSpend',
  tickets: 'vivenuMatchesPurchasedCount',
};

export default async function CustomersListPage(
  props: {
    searchParams: Promise<{
      page?: string;
      q?: string;
      marketingOptIn?: string;
      minSpend?: string;
      segment?: string;
      sort?: string;
      dir?: string;
    }>;
  }
) {
  const searchParams = await props.searchParams;
  const user = requireStaff(await getCurrentUser());
  const pref = await getCachedStaffPreferences(user.id);
  const PER_PAGE = resolvePageSize(pref, DEFAULT_PER_PAGE);

  const page = Math.max(1, parseInt(searchParams.page ?? '1') || 1);
  const q = searchParams.q ?? '';
  const marketingOptIn =
    searchParams.marketingOptIn === 'true' ? true : searchParams.marketingOptIn === 'false' ? false : undefined;
  const minSpend = searchParams.minSpend ? Number(searchParams.minSpend) : undefined;
  const segment = searchParams.segment || undefined;
  const where = buildCustomerWhere({ q: q || undefined, marketingOptIn, minSpend, segment });

  const sortField = (Object.keys(SORT_COLUMNS) as SortField[]).includes(searchParams.sort as SortField)
    ? (searchParams.sort as SortField)
    : undefined;
  const sortDir: 'asc' | 'desc' = searchParams.dir === 'asc' ? 'asc' : 'desc';
  // Nulls (never-synced customers) always sort last regardless of direction — otherwise "desc"
  // on Shopify Spend would put every unenriched customer above actual top spenders, since
  // SQLite/Prisma's default null ordering isn't what a staff member sorting by spend expects.
  const orderBy = sortField
    ? [{ [SORT_COLUMNS[sortField]]: { sort: sortDir, nulls: 'last' as const } }]
    : [{ updatedAt: 'desc' as const }];

  const [customers, total, segments] = await Promise.all([
    prisma.customer.findMany({ where, orderBy, take: PER_PAGE, skip: (page - 1) * PER_PAGE }),
    prisma.customer.count({ where }),
    topGoliathSegments(50),
  ]);

  const pages = Math.ceil(total / PER_PAGE) || 1;

  function urlWith(overrides: Partial<{ q: string; marketingOptIn: string; minSpend: string; segment: string; page: string; sort: string; dir: string }>) {
    const next = {
      q,
      marketingOptIn: marketingOptIn === undefined ? '' : String(marketingOptIn),
      minSpend: minSpend !== undefined ? String(minSpend) : '',
      segment: segment ?? '',
      page: '',
      sort: sortField ?? '',
      dir: sortDir,
      ...overrides,
    };
    const params = new URLSearchParams();
    if (next.q) params.set('q', next.q);
    if (next.marketingOptIn) params.set('marketingOptIn', next.marketingOptIn);
    if (next.minSpend) params.set('minSpend', next.minSpend);
    if (next.segment) params.set('segment', next.segment);
    if (next.page && next.page !== '1') params.set('page', next.page);
    if (next.sort) params.set('sort', next.sort);
    if (next.sort && next.dir) params.set('dir', next.dir);
    const qs = params.toString();
    return '/customers/list' + (qs ? `?${qs}` : '');
  }

  // Clicking an unsorted column defaults to descending (biggest spend / opted-in first reads
  // more usefully than ascending on a first click); clicking the active column flips direction.
  function sortHeader(field: SortField, label: string) {
    const isActive = sortField === field;
    const nextDir = isActive && sortDir === 'desc' ? 'asc' : 'desc';
    return (
      <th>
        <Link
          href={urlWith({ sort: field, dir: nextDir, page: '' })}
          className="sortable-column-header"
          style={{ color: 'inherit', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          {label}
          {isActive && <span aria-hidden>{sortDir === 'desc' ? '↓' : '↑'}</span>}
        </Link>
      </th>
    );
  }

  const consentFilters: { label: string; value: string }[] = [
    { label: 'All consent', value: '' },
    { label: 'Opted in', value: 'true' },
    { label: 'Opted out', value: 'false' },
  ];
  const currentConsent = marketingOptIn === undefined ? '' : String(marketingOptIn);

  return (
    <AppShell user={user} wide>
      <div className="page-header">
        <div>
          <h1>Customers <span style={{ fontWeight: 400, color: '#8890b4' }}>({total})</span></h1>
          <p>Unified fan record — Descope identity, Goliath segments, Shopify spend.</p>
        </div>
        <Link href="/customers" className="asset-link">← Dashboard</Link>
      </div>

      <div className="customer-layout">
        <aside className="sticky-sidebar">
          <div className="card">
            <form method="get">
              <input type="hidden" name="marketingOptIn" value={currentConsent} />
              <input type="hidden" name="segment" value={segment ?? ''} />
              {sortField && <input type="hidden" name="sort" value={sortField} />}
              {sortField && <input type="hidden" name="dir" value={sortDir} />}
              <div className="field">
                <label htmlFor="q">Search</label>
                <input type="text" id="q" name="q" placeholder="Name or email" defaultValue={q} />
              </div>
              <div className="field">
                <label htmlFor="minSpend">Min spend (DKK)</label>
                <input type="number" id="minSpend" name="minSpend" defaultValue={minSpend ?? ''} />
              </div>
              <button className="btn-primary" type="submit" style={{ width: '100%' }}>Search</button>
            </form>
          </div>

          <div className="card">
            <div className="customer-rail-section">
              <div className="customer-rail-label">Consent</div>
              {consentFilters.map((f) => (
                <Link
                  key={f.value}
                  href={urlWith({ marketingOptIn: f.value })}
                  className={'customer-rail-item' + (currentConsent === f.value ? ' active' : '')}
                >
                  {f.label}
                </Link>
              ))}
            </div>

            <div className="customer-rail-section">
              <div className="customer-rail-label">Goliath segments</div>
              <Link
                href={urlWith({ segment: '' })}
                className={'customer-rail-item' + (!segment ? ' active' : '')}
              >
                All segments
              </Link>
              {segments.length === 0 ? (
                <p style={{ color: '#8890b4', fontSize: 12, padding: '4px 10px' }}>No segments synced yet.</p>
              ) : (
                segments.map((s) => (
                  <Link
                    key={s.name}
                    href={urlWith({ segment: s.name })}
                    className={'customer-rail-item' + (segment === s.name ? ' active' : '')}
                  >
                    <span>{s.name}</span>
                    <span className="customer-rail-item-count">{s.count}</span>
                  </Link>
                ))
              )}
            </div>
          </div>
        </aside>

        <div>
          <div className="card" style={{ padding: 0 }}>
            {customers.length === 0 ? (
              <div style={{ padding: '48px 32px', textAlign: 'center', color: '#8890b4' }}>
                No customers synced yet — the sync cron (/api/cron/sync-customers) populates this table.
              </div>
            ) : (
              <div className="asset-table-wrap">
                <table className="asset-table customer-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      {sortHeader('consent', 'Consent')}
                      {sortHeader('spend', 'Shopify Spend')}
                      {sortHeader('tickets', '# of Tickets')}
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((customer) => (
                      <tr key={customer.id}>
                        <td style={{ fontWeight: 500 }}>
                          <Link href={`/customers/${customer.id}`} className="asset-link" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span className="customer-avatar" style={{ background: avatarColor(customer.id) }}>
                              {avatarInitial(customer.name, customer.email)}
                            </span>
                            {customer.name || customer.email || '—'}
                          </Link>
                        </td>
                        <td>{customer.email || '—'}</td>
                        <td>{consentBadge(customer.marketingOptIn)}</td>
                        <td>
                          {customer.shopifyLifetimeSpend != null ? formatSpend(customer.shopifyLifetimeSpend) : '—'}
                        </td>
                        <td>{customer.vivenuMatchesPurchasedCount ?? '—'}</td>
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
                href={urlWith({ page: String(page - 1) })}
                className="btn-secondary"
                style={{ pointerEvents: page <= 1 ? 'none' : 'auto', opacity: page <= 1 ? 0.4 : 1, textDecoration: 'none' }}
              >
                ← Prev
              </a>
              <span className="page-info">Page {page} of {pages} · {total} total</span>
              <a
                href={urlWith({ page: String(page + 1) })}
                className="btn-secondary"
                style={{ pointerEvents: page >= pages ? 'none' : 'auto', opacity: page >= pages ? 0.4 : 1, textDecoration: 'none' }}
              >
                Next →
              </a>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
