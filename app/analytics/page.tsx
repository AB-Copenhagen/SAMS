import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../lib/auth';
import { prisma } from '../../lib/db';
import AppShell from '../../components/AppShell';

const RATINGS = [1, 2, 3, 4] as const;

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
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') redirect('/login');

  const [
    imageCount,
    videoCount,
    otherCount,
    uploadsByUser,
    reviewsByUser,
    unratedCount,
    ratingCounts,
    totalViews,
    totalDownloads,
    uniqueViewers,
    uniqueDownloaders,
    viewsByCollection,
    downloadsByAsset,
  ] = await Promise.all([
    prisma.asset.count({ where: { fileType: { startsWith: 'image/' } } }),
    prisma.asset.count({ where: { fileType: { startsWith: 'video/' } } }),
    prisma.asset.count({ where: { NOT: [{ fileType: { startsWith: 'image/' } }, { fileType: { startsWith: 'video/' } }] } }),
    prisma.asset.groupBy({
      by: ['uploaderEmail'],
      _count: { uploaderEmail: true },
      orderBy: { _count: { uploaderEmail: 'desc' } },
      take: 15,
    }),
    prisma.asset.groupBy({
      by: ['reviewedBy'],
      where: { reviewedBy: { not: null } },
      _count: { reviewedBy: true },
      orderBy: { _count: { reviewedBy: 'desc' } },
      take: 15,
    }),
    prisma.asset.count({ where: { rating: null } }),
    Promise.all(RATINGS.map((n) => prisma.asset.count({ where: { rating: n } }))),
    prisma.shareEvent.count({ where: { kind: 'view' } }),
    prisma.shareEvent.count({ where: { kind: 'download' } }),
    prisma.shareEvent.groupBy({ by: ['ipHash'], where: { kind: 'view', ipHash: { not: null } } }).then((r) => r.length),
    prisma.shareEvent.groupBy({ by: ['ipHash'], where: { kind: 'download', ipHash: { not: null } } }).then((r) => r.length),
    prisma.shareEvent.groupBy({
      by: ['collectionId'],
      where: { kind: 'view', collectionId: { not: null } },
      _count: { collectionId: true },
      orderBy: { _count: { collectionId: 'desc' } },
      take: 10,
    }),
    prisma.shareEvent.groupBy({
      by: ['assetId'],
      where: { kind: 'download', assetId: { not: null } },
      _count: { assetId: true },
      orderBy: { _count: { assetId: 'desc' } },
      take: 10,
    }),
  ]);

  const totalAssets = imageCount + videoCount + otherCount;

  const [collectionNames, assetTitles] = await Promise.all([
    prisma.collection.findMany({
      where: { id: { in: viewsByCollection.map((v) => v.collectionId as string) } },
      select: { id: true, name: true },
    }),
    prisma.asset.findMany({
      where: { id: { in: downloadsByAsset.map((d) => d.assetId as string) } },
      select: { id: true, title: true, eventName: true },
    }),
  ]);
  const collectionNameById = new Map(collectionNames.map((c) => [c.id, c.name]));
  const assetTitleById = new Map(assetTitles.map((a) => [a.id, a.title || a.eventName || 'Untitled']));

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
        <LeaderboardTable
          columns={['Uploader', 'Assets uploaded']}
          rows={uploadsByUser.map((u) => ({ label: u.uploaderEmail, count: u._count.uploaderEmail }))}
          emptyMessage="No uploads yet."
        />
      </div>

      <h2 style={{ marginTop: 32 }}>Reviews by user</h2>
      <div className="card" style={{ padding: 0 }}>
        <LeaderboardTable
          columns={['Reviewer', 'Assets reviewed']}
          rows={reviewsByUser.map((r) => ({ label: r.reviewedBy as string, count: r._count.reviewedBy }))}
          emptyMessage="No reviews yet."
        />
      </div>

      <h2 style={{ marginTop: 32 }}>Top viewed galleries</h2>
      <div className="card" style={{ padding: 0 }}>
        <LeaderboardTable
          columns={['Collection', 'Views']}
          rows={viewsByCollection.map((v) => ({
            label: collectionNameById.get(v.collectionId as string) || 'Deleted collection',
            count: v._count.collectionId,
          }))}
          emptyMessage="No public gallery views recorded yet."
        />
      </div>

      <h2 style={{ marginTop: 32 }}>Top downloaded assets</h2>
      <div className="card" style={{ padding: 0 }}>
        <LeaderboardTable
          columns={['Asset', 'Downloads']}
          rows={downloadsByAsset.map((d) => ({
            label: assetTitleById.get(d.assetId as string) || 'Deleted asset',
            count: d._count.assetId,
          }))}
          emptyMessage="No downloads recorded yet."
        />
      </div>
    </AppShell>
  );
}
