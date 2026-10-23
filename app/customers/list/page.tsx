import Link from 'next/link';
import { getCurrentUser, requireAdmin } from '../../../lib/auth';
import { prisma } from '../../../lib/db';
import { getCachedStaffPreferences, resolvePageSize } from '../../../lib/staff-preferences';
import AppShell from '../../../components/AppShell';
import { buildCustomerWhere, topGoliathSegments } from '../../../lib/customer-query';

const DEFAULT_PER_PAGE = 50;
const AVATAR_COLORS = [
  'var(--avatar-color-1)', 'var(--avatar-color-2)', 'var(--avatar-color-3)',
  'var(--avatar-color-4)', 'var(--avatar-color-5)', 'var(--avatar-color-6)',
];

function segmentNames(json: string | null): string[] {
  if (!json) return [];
  try {
    return JSON.parse(json) as string[];
  } catch {
    return [];
  }
}

// Deterministic per-customer color so the same row always gets the same avatar color across
// page loads — not cryptographic, just needs to be stable and spread across the palette.
function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function avatarInitial(name: string | null, email: string | null): string {
  const source = name || email || '?';
  return source.charAt(0).toUpperCase();
}

function consentBadge(marketingOptIn: boolean | null) {
  if (marketingOptIn === null) return <span className="consent-badge badge-opted-unknown">UNKNOWN</span>;
  return marketingOptIn
    ? <span className="consent-badge badge-opted-in">OPTED IN</span>
    : <span className="consent-badge badge-opted-out">OPTED OUT</span>;
}

export default async function CustomersListPage(
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

  const [customers, total, segments] = await Promise.all([
    prisma.customer.findMany({ where, orderBy: { updatedAt: 'desc' }, take: PER_PAGE, skip: (page - 1) * PER_PAGE }),
    prisma.customer.count({ where }),
    topGoliathSegments(50),
  ]);

  const pages = Math.ceil(total / PER_PAGE) || 1;

  function urlWith(overrides: Partial<{ q: string; marketingOptIn: string; minSpend: string; segment: string; page: string }>) {
    const next = {
      q,
      marketingOptIn: marketingOptIn === undefined ? '' : String(marketingOptIn),
      minSpend: minSpend !== undefined ? String(minSpend) : '',
      segment: segment ?? '',
      page: '',
      ...overrides,
    };
    const params = new URLSearchParams();
    if (next.q) params.set('q', next.q);
    if (next.marketingOptIn) params.set('marketingOptIn', next.marketingOptIn);
    if (next.minSpend) params.set('minSpend', next.minSpend);
    if (next.segment) params.set('segment', next.segment);
    if (next.page && next.page !== '1') params.set('page', next.page);
    const qs = params.toString();
    return '/customers/list' + (qs ? `?${qs}` : '');
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
                          {segmentNames(customer.goliathSegmentsJson).length > 0
                            ? segmentNames(customer.goliathSegmentsJson).map((name) => (
                                <span key={name} className="segment-chip">{name}</span>
                              ))
                            : <span style={{ color: '#8890b4', fontSize: 12 }}>—</span>}
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
