import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, requireAdmin } from '../../../lib/auth';
import { prisma } from '../../../lib/db';
import AppShell from '../../../components/AppShell';
import CollapsibleCard from '../../../components/CollapsibleCard';
import { customerAdminUrl } from '../../../lib/shopify';
import { userDashboardUrl } from '../../../lib/goliath';
import { subscriberDashboardUrl } from '../../../lib/mailerlite';
import { customerDashboardUrl as vivenuDashboardUrl } from '../../../lib/vivenu';
import { avatarColor, avatarInitial, segmentNames, formatSpend } from '../../../lib/customer-ui';
import { isExternalDataStale, refreshCustomerExternalData } from '../../../lib/customer-enrichment';

const ACTIVITY_PER_PAGE = 20;

function syncedLabel(date: Date | null) {
  return date ? `Synced ${new Date(date).toLocaleString()}` : 'Not yet synced';
}

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

const ACTIVITY_META: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  login: {
    label: 'Login',
    className: 'activity-icon-login',
    icon: <Icon><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" /></Icon>,
  },
  consent_changed: {
    label: 'Consent changed',
    className: 'activity-icon-consent',
    icon: <Icon><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" /></Icon>,
  },
  segments_changed: {
    label: 'Segments changed',
    className: 'activity-icon-segment',
    icon: <Icon><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></Icon>,
  },
  order_placed: {
    label: 'Order',
    className: 'activity-icon-order',
    icon: <Icon><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></Icon>,
  },
  mailerlite_status_changed: {
    label: 'MailerLite status changed',
    className: 'activity-icon-mailerlite',
    icon: <Icon><path d="M4 4h16v16H4z" /><polyline points="22 6 12 13 2 6" /></Icon>,
  },
  match_attended: {
    label: 'Match attended',
    className: 'activity-icon-order',
    icon: <Icon><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></Icon>,
  },
};

export default async function CustomerDetailPage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const user = requireAdmin(await getCurrentUser());

  const customer = await prisma.customer.findUnique({ where: { id: params.id } });
  if (!customer) notFound();

  // Shopify/MailerLite are fetched lazily here rather than eagerly for every customer on every
  // Descope sync (see lib/customer-enrichment.ts). Each platform is gated on its own syncedAt
  // inside refreshCustomerExternalData — not a single combined check here — so one platform
  // succeeding can never mask the other having failed and never gotten a chance to retry.
  Object.assign(customer, await refreshCustomerExternalData(customer));

  const page = Math.max(1, parseInt(searchParams.page ?? '1') || 1);
  const [activity, activityTotal] = await Promise.all([
    prisma.customerActivity.findMany({
      where: { customerId: customer.id },
      orderBy: { occurredAt: 'desc' },
      take: ACTIVITY_PER_PAGE,
      skip: (page - 1) * ACTIVITY_PER_PAGE,
    }),
    prisma.customerActivity.count({ where: { customerId: customer.id } }),
  ]);
  const activityPages = Math.ceil(activityTotal / ACTIVITY_PER_PAGE) || 1;

  const segments = segmentNames(customer.goliathSegmentsJson);
  const mailerliteGroups = segmentNames(customer.mailerliteGroupsJson);
  const shopifyUrl = customer.shopifyCustomerId ? customerAdminUrl(customer.shopifyCustomerId) : null;
  const goliathUrl = customer.goliathUserId ? userDashboardUrl(customer.goliathUserId) : null;
  const mailerliteUrl = customer.mailerliteSubscriberId ? subscriberDashboardUrl(customer.mailerliteSubscriberId) : null;
  const vivenuUrl = customer.vivenuCustomerId ? vivenuDashboardUrl(customer.vivenuCustomerId) : null;
  const daysSinceLogin = customer.lastLoginAt
    ? Math.floor((Date.now() - new Date(customer.lastLoginAt).getTime()) / 86_400_000)
    : null;

  const identitySummary = [
    customer.marketingOptIn === null ? null : customer.marketingOptIn ? 'Opted in' : 'Opted out',
    daysSinceLogin === null ? 'Never logged in' : daysSinceLogin === 0 ? 'Logged in today' : `Last login ${daysSinceLogin}d ago`,
  ].filter(Boolean).join(' · ') || 'No identity data';

  const goliathSummary = segments.length > 0 ? `${segments.length} segment${segments.length === 1 ? '' : 's'}` : 'No segments';

  const shopifySummary = customer.shopifyLifetimeSpend != null
    ? `${formatSpend(customer.shopifyLifetimeSpend)} · ${customer.shopifyOrderCount ?? 0} order${customer.shopifyOrderCount === 1 ? '' : 's'}`
    : 'No Shopify data';

  const mailerliteSummary = customer.mailerliteStatus
    ? `${customer.mailerliteStatus.toUpperCase()}${customer.mailerliteOpenRate != null ? ` · ${Math.round(customer.mailerliteOpenRate * 100)}% opens` : ''}`
    : 'Not subscribed';

  const vivenuSummary = customer.vivenuCustomerId
    ? [
        customer.vivenuSeasonPassStatus ? 'Season pass' : null,
        `${customer.vivenuMatchesAttendedCount ?? 0}/${customer.vivenuMatchesPurchasedCount ?? 0} attended`,
      ].filter(Boolean).join(' · ')
    : 'No EventBilletten account linked';

  return (
    <AppShell user={user} wide>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="customer-avatar" style={{ background: avatarColor(customer.id), width: 44, height: 44, fontSize: 17 }}>
            {avatarInitial(customer.name, customer.email)}
          </span>
          <div>
            <h1>{customer.name || customer.email || customer.id}</h1>
            <p>{customer.email}</p>
          </div>
        </div>
        <Link href="/customers/list" className="asset-link">← Back to customers</Link>
      </div>

      <div className="customer-layout">
        <aside className="sticky-sidebar">
          <CollapsibleCard title="Identity & consent" summary={identitySummary}>
            <div className="field">
              <label>Phone</label>
              <div className="detail-value">{customer.phone || '—'}</div>
            </div>
            <div className="field">
              <label>Marketing consent</label>
              <div className="detail-value">
                {customer.marketingOptIn === null ? '—' : customer.marketingOptIn ? (
                  <span className="consent-badge badge-opted-in">OPTED IN</span>
                ) : (
                  <span className="consent-badge badge-opted-out">OPTED OUT</span>
                )}
              </div>
            </div>
            <div className="field">
              <label>Account created</label>
              <div className="detail-value">{customer.descopeCreatedAt ? new Date(customer.descopeCreatedAt).toLocaleDateString() : '—'}</div>
            </div>
            <div className="field">
              <label>Last login</label>
              <div className="detail-value">
                {customer.lastLoginAt ? new Date(customer.lastLoginAt).toLocaleString() : '—'}
                {customer.lastLoginCountry ? ` (${customer.lastLoginCountry})` : ''}
              </div>
            </div>
            <p style={{ color: '#8890b4', fontSize: 12 }}>{syncedLabel(customer.descopeSyncedAt)}</p>
          </CollapsibleCard>

          <CollapsibleCard title="Goliath segments" summary={goliathSummary}>
            <div style={{ marginBottom: 10 }}>
              {segments.length > 0
                ? segments.map((name) => <span key={name} className="segment-chip">{name}</span>)
                : <p style={{ color: '#8890b4', fontSize: 13 }}>No segment membership synced.</p>}
            </div>
            {goliathUrl && (
              <p style={{ marginBottom: 8 }}>
                <a href={goliathUrl} target="_blank" rel="noopener noreferrer" className="asset-link">View in Goliath ↗</a>
              </p>
            )}
            <p style={{ color: '#8890b4', fontSize: 12 }}>{syncedLabel(customer.goliathSyncedAt)}</p>
          </CollapsibleCard>

          <CollapsibleCard title="Shopify" summary={shopifySummary}>
            <div className="field">
              <label>Lifetime spend</label>
              <div className="detail-value">{customer.shopifyLifetimeSpend != null ? formatSpend(customer.shopifyLifetimeSpend) : '—'}</div>
            </div>
            <div className="field">
              <label>Orders</label>
              <div className="detail-value">{customer.shopifyOrderCount ?? '—'}</div>
            </div>
            <div className="field">
              <label>Last order</label>
              <div className="detail-value">{customer.shopifyLastOrderAt ? new Date(customer.shopifyLastOrderAt).toLocaleDateString() : '—'}</div>
            </div>
            {shopifyUrl && (
              <p style={{ marginBottom: 8 }}>
                <a href={shopifyUrl} target="_blank" rel="noopener noreferrer" className="asset-link">View in Shopify ↗</a>
              </p>
            )}
            <p style={{ color: '#8890b4', fontSize: 12 }}>{syncedLabel(customer.shopifySyncedAt)}</p>
          </CollapsibleCard>

          <CollapsibleCard title="MailerLite" summary={mailerliteSummary}>
            <div className="field">
              <label>Status</label>
              <div className="detail-value">
                {customer.mailerliteStatus ? (
                  <span className={'mailerlite-badge' + (customer.mailerliteStatus === 'active' ? ' mailerlite-badge-active' : ' mailerlite-badge-other')}>
                    {customer.mailerliteStatus.toUpperCase()}
                  </span>
                ) : '—'}
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              {mailerliteGroups.length > 0
                ? mailerliteGroups.map((name) => <span key={name} className="segment-chip">{name}</span>)
                : <p style={{ color: '#8890b4', fontSize: 13 }}>No group membership synced.</p>}
            </div>
            <div className="field">
              <label>Sent / opens</label>
              <div className="detail-value">
                {customer.mailerliteSentCount != null
                  ? `${customer.mailerliteSentCount} sent · ${customer.mailerliteOpensCount ?? 0} opened${customer.mailerliteOpenRate != null ? ` (${Math.round(customer.mailerliteOpenRate * 100)}%)` : ''}`
                  : '—'}
              </div>
            </div>
            {mailerliteUrl && (
              <p style={{ marginBottom: 8 }}>
                <a href={mailerliteUrl} target="_blank" rel="noopener noreferrer" className="asset-link">View in MailerLite ↗</a>
              </p>
            )}
            <p style={{ color: '#8890b4', fontSize: 12 }}>{syncedLabel(customer.mailerliteSyncedAt)}</p>
          </CollapsibleCard>

          <CollapsibleCard title="EventBilletten (Vivenu)" summary={vivenuSummary}>
            <div className="field">
              <label>Season pass</label>
              <div className="detail-value">{customer.vivenuSeasonPassStatus || '—'}</div>
            </div>
            <div className="field">
              <label>Lifetime ticket spend</label>
              <div className="detail-value">{customer.vivenuLifetimeSpend != null ? formatSpend(customer.vivenuLifetimeSpend) : '—'}</div>
            </div>
            <div className="field">
              <label>Matches purchased</label>
              <div className="detail-value">{customer.vivenuMatchesPurchasedCount ?? '—'}</div>
            </div>
            <div className="field">
              <label>Matches attended</label>
              <div className="detail-value">{customer.vivenuMatchesAttendedCount ?? '—'}</div>
            </div>
            {vivenuUrl && (
              <p style={{ marginBottom: 8 }}>
                <a href={vivenuUrl} target="_blank" rel="noopener noreferrer" className="asset-link">View in Vivenu ↗</a>
              </p>
            )}
            <p style={{ color: '#8890b4', fontSize: 12 }}>{syncedLabel(customer.vivenuSyncedAt)}</p>
          </CollapsibleCard>
        </aside>

        <div>
          <div className="stat-row">
            <div className="stat-card">
              <div className="stat-label">Lifetime spend</div>
              <div className="stat-value">{customer.shopifyLifetimeSpend != null ? formatSpend(customer.shopifyLifetimeSpend) : '—'}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Orders</div>
              <div className="stat-value">{customer.shopifyOrderCount ?? '—'}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Days since login</div>
              <div className="stat-value">{daysSinceLogin ?? '—'}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Segments</div>
              <div className="stat-value">{segments.length}</div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">Activity</div>
            {activity.length === 0 ? (
              <p style={{ color: '#8890b4', fontSize: 13 }}>
                No activity recorded yet — this log only captures changes from here on, nothing retroactive.
              </p>
            ) : (
              <div className="config-list">
                {activity.map((a) => {
                  const meta = ACTIVITY_META[a.type] ?? { label: a.type, className: 'activity-icon-login', icon: null };
                  return (
                    <div key={a.id} className="config-item">
                      <span className={`activity-icon ${meta.className}`}>{meta.icon}</span>
                      <div className="config-item-info">
                        <div className="config-item-title">{a.detail || meta.label}</div>
                        <div className="config-item-sub">{new Date(a.occurredAt).toLocaleString()}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {activity.length > 0 && activityPages > 1 && (
            <div className="pagination">
              <a
                href={`/customers/${customer.id}?page=${page - 1}`}
                className="btn-secondary"
                style={{ pointerEvents: page <= 1 ? 'none' : 'auto', opacity: page <= 1 ? 0.4 : 1, textDecoration: 'none' }}
              >
                ← Prev
              </a>
              <span className="page-info">Page {page} of {activityPages} · {activityTotal} total</span>
              <a
                href={`/customers/${customer.id}?page=${page + 1}`}
                className="btn-secondary"
                style={{ pointerEvents: page >= activityPages ? 'none' : 'auto', opacity: page >= activityPages ? 0.4 : 1, textDecoration: 'none' }}
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
