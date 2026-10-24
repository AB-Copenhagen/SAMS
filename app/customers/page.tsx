import Link from 'next/link';
import { getCurrentUser, requireAdmin } from '../../lib/auth';
import AppShell from '../../components/AppShell';
import { getCustomerKpis, getCachedCustomerDashboard, type CustomerSyncRunSummary } from '../../lib/customer-query';
import { formatSpend } from '../../lib/customer-ui';

const SOURCE_LABELS: Record<string, string> = {
  descope: 'Descope profiles',
  'descope-logins': 'Descope logins',
  goliath: 'Goliath segments',
};

function pct(part: number, total: number): string {
  return total > 0 ? `${Math.round((part / total) * 100)}%` : '—';
}

function statusColor(status: string | null): string {
  if (status === 'error') return '#dc2626';
  if (status === 'running') return '#8890b4';
  if (status === 'success') return '#16a34a';
  return '#8890b4';
}

function SyncRunRow({ run }: { run: CustomerSyncRunSummary }) {
  const label = SOURCE_LABELS[run.source] ?? run.source;
  if (!run.status) {
    return (
      <div className="config-item">
        <div className="config-item-info">
          <div className="config-item-title">{label}</div>
          <div className="config-item-sub">Not yet run</div>
        </div>
      </div>
    );
  }
  return (
    <div className="config-item">
      <div className="config-item-info">
        <div className="config-item-title">
          {label}{' '}
          <span style={{ fontWeight: 400, color: statusColor(run.status) }}>· {run.status}</span>
        </div>
        <div className="config-item-sub">
          {run.status === 'error'
            ? run.errorMessage ?? 'Unknown error'
            : run.finishedAt
              ? `${new Date(run.finishedAt).toLocaleString()}${run.processed != null ? ` · ${run.processed} processed` : ''}`
              : `Started ${run.startedAt ? new Date(run.startedAt).toLocaleString() : 'recently'}${run.processed ? ` · ${run.processed} processed so far` : ''}`}
        </div>
      </div>
    </div>
  );
}

export default async function CustomersDashboardPage() {
  const user = requireAdmin(await getCurrentUser());
  const [kpis, dashboard] = await Promise.all([getCustomerKpis(), getCachedCustomerDashboard()]);

  return (
    <AppShell user={user}>
      <div className="page-header">
        <div>
          <h1>Customers</h1>
          <p>Unified fan record — Descope identity, Goliath segments, Shopify spend.</p>
        </div>
        <Link href="/customers/list" className="btn-primary" style={{ textDecoration: 'none' }}>
          Browse all customers →
        </Link>
      </div>

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Total customers</div>
          <div className="stat-value">{kpis.total}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Opted in</div>
          <div className="stat-value">{kpis.optedIn} <span style={{ fontSize: 14, color: '#8890b4' }}>({pct(kpis.optedIn, kpis.total)})</span></div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Synced w/ Goliath</div>
          <div className="stat-value">{kpis.goliathSynced} <span style={{ fontSize: 14, color: '#8890b4' }}>({pct(kpis.goliathSynced, kpis.total)})</span></div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Synced w/ Shopify</div>
          <div className="stat-value">{kpis.shopifySynced} <span style={{ fontSize: 14, color: '#8890b4' }}>({pct(kpis.shopifySynced, kpis.total)})</span></div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Synced w/ MailerLite</div>
          <div className="stat-value">{kpis.mailerliteSynced} <span style={{ fontSize: 14, color: '#8890b4' }}>({pct(kpis.mailerliteSynced, kpis.total)})</span></div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">Sync health</div>
        <div className="config-list">
          {dashboard.syncRuns.map((run) => <SyncRunRow key={run.source} run={run} />)}
          <div className="config-item">
            <div className="config-item-info">
              <div className="config-item-title">Shopify spend</div>
              <div className="config-item-sub">
                {dashboard.shopify.mostRecentSyncedAt
                  ? `Most recent sync ${new Date(dashboard.shopify.mostRecentSyncedAt).toLocaleString()} · ${dashboard.shopify.syncedCount} customer(s) synced`
                  : 'No customer has synced Shopify data yet'}
                {' · syncs per-customer, enqueued from the Descope sync (no single run to report)'}
              </div>
            </div>
          </div>
          <div className="config-item">
            <div className="config-item-info">
              <div className="config-item-title">MailerLite</div>
              <div className="config-item-sub">
                {kpis.mailerliteSynced > 0
                  ? `${kpis.mailerliteSynced} customer(s) synced`
                  : 'No customer has synced MailerLite data yet'}
                {' · syncs per-customer, enqueued from the Descope sync (no single run to report)'}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="dashboard-row">
        <div className="card">
          <div className="card-header">Top spenders (Shopify)</div>
          {dashboard.topSpenders.length === 0 ? (
            <p style={{ color: '#8890b4', fontSize: 13 }}>No Shopify spend synced yet.</p>
          ) : (
            <div className="config-list">
              {dashboard.topSpenders.map((c) => (
                <div key={c.id} className="config-item">
                  <div className="config-item-info">
                    <Link href={`/customers/${c.id}`} className="config-item-title asset-link" style={{ display: 'block' }}>
                      {c.name || c.email || c.id}
                    </Link>
                    <div className="config-item-sub">{formatSpend(c.shopifyLifetimeSpend!)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header">Recent logins</div>
          {dashboard.recentLogins.length === 0 ? (
            <p style={{ color: '#8890b4', fontSize: 13 }}>No login activity synced yet.</p>
          ) : (
            <div className="config-list">
              {dashboard.recentLogins.map((c) => (
                <div key={c.id} className="config-item">
                  <div className="config-item-info">
                    <Link href={`/customers/${c.id}`} className="config-item-title asset-link" style={{ display: 'block' }}>
                      {c.name || c.email || c.id}
                    </Link>
                    <div className="config-item-sub">
                      {new Date(c.lastLoginAt!).toLocaleString()}{c.lastLoginCountry ? ` (${c.lastLoginCountry})` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="dashboard-row">
        <div className="card">
          <div className="card-header">Top Goliath segments</div>
          {dashboard.topSegments.length === 0 ? (
            <p style={{ color: '#8890b4', fontSize: 13 }}>No segment membership synced yet.</p>
          ) : (
            <div>
              {dashboard.topSegments.map((s) => (
                <Link key={s.name} href={`/customers/list?segment=${encodeURIComponent(s.name)}`} className="segment-chip" style={{ fontSize: 13, padding: '4px 10px' }}>
                  {s.name} · {s.count}
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header">Top MailerLite groups</div>
          {dashboard.topMailerliteGroups.length === 0 ? (
            <p style={{ color: '#8890b4', fontSize: 13 }}>No MailerLite data synced yet.</p>
          ) : (
            <div>
              {dashboard.topMailerliteGroups.map((g) => (
                <span key={g.name} className="segment-chip" style={{ fontSize: 13, padding: '4px 10px' }}>
                  {g.name} · {g.count}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
