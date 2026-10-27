import { getCurrentUser, requireAdmin } from '../../lib/auth';
import { getCachedAnalytics, RATINGS } from '../../lib/analytics-report';
import AppShell from '../../components/AppShell';

function LeaderboardTable({
  columns,
  rows,
  emptyMessage,
}: {
  columns: [string, string];
  rows: { label: string; count: number }[];
  emptyMessage: string;
}) {
  if (rows.length === 0) {
    return <div style={{ padding: '24px 20px', textAlign: 'center', color: '#8890b4' }}>{emptyMessage}</div>;
  }
  return (
    <div className="asset-table-wrap">
      <table className="asset-table">
        <thead>
          <tr>
            <th>{columns[0]}</th>
            <th>{columns[1]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td style={{ fontWeight: 500 }}>{row.label}</td>
              <td>{row.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function AnalyticsPage() {
  const user = requireAdmin(await getCurrentUser());

  const {
    totalAssets,
    imageCount,
    videoCount,
    otherCount,
    totalViews,
    totalDownloads,
    uniqueViewers,
    uniqueDownloaders,
    unratedCount,
    ratingCounts,
    uploadsByUser,
    reviewsByUser,
    viewsByCollection,
    downloadsByAsset,
  } = await getCachedAnalytics();

  return (
    <AppShell user={user}>
      <div className="page-header">
        <div>
          <h1>Analytics</h1>
          <p>Asset inventory, review activity, and public-share engagement.</p>
        </div>
      </div>

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Total assets</div>
          <div className="stat-value">{totalAssets}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Photos</div>
          <div className="stat-value">{imageCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Videos</div>
          <div className="stat-value">{videoCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Other</div>
          <div className="stat-value">{otherCount}</div>
        </div>
      </div>

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Gallery views</div>
          <div className="stat-value">{totalViews}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Unique viewers</div>
          <div className="stat-value">{uniqueViewers}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Downloads</div>
          <div className="stat-value">{totalDownloads}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Unique downloaders</div>
          <div className="stat-value">{uniqueDownloaders}</div>
        </div>
      </div>
      <p style={{ color: '#8890b4', fontSize: 12, marginTop: -8 }}>
        &ldquo;Unique&rdquo; is by hashed IP address (no raw IPs are stored) — public share links don&apos;t require a name or login, so this is an approximation, not a verified visitor count.
      </p>

      <h2 style={{ marginTop: 32 }}>Star rating breakdown</h2>
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Unrated</div>
          <div className="stat-value">{unratedCount}</div>
        </div>
        {RATINGS.map((n, i) => (
          <div className="stat-card" key={n}>
            <div className="stat-label">{'★'.repeat(n)}</div>
            <div className="stat-value">{ratingCounts[i]}</div>
          </div>
        ))}
      </div>

      <h2 style={{ marginTop: 32 }}>Uploads by user</h2>
      <div className="card" style={{ padding: 0 }}>
        <LeaderboardTable columns={['Uploader', 'Assets uploaded']} rows={uploadsByUser} emptyMessage="No uploads yet." />
      </div>

      <h2 style={{ marginTop: 32 }}>Reviews by user</h2>
      <div className="card" style={{ padding: 0 }}>
        <LeaderboardTable columns={['Reviewer', 'Assets reviewed']} rows={reviewsByUser} emptyMessage="No reviews yet." />
      </div>

      <h2 style={{ marginTop: 32 }}>Top viewed galleries</h2>
      <div className="card" style={{ padding: 0 }}>
        <LeaderboardTable
          columns={['Collection', 'Views']}
          rows={viewsByCollection}
          emptyMessage="No public gallery views recorded yet."
        />
      </div>

      <h2 style={{ marginTop: 32 }}>Top downloaded assets</h2>
      <div className="card" style={{ padding: 0 }}>
        <LeaderboardTable columns={['Asset', 'Downloads']} rows={downloadsByAsset} emptyMessage="No downloads recorded yet." />
      </div>
    </AppShell>
  );
}
