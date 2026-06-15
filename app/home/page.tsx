import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '../../lib/auth';
import { prisma } from '../../lib/db';
import AppShell from '../../components/AppShell';

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const [assetCount, collectionCount, playerCount, sizeResult, recentAssets, recentCollections] = await Promise.all([
    prisma.asset.count(),
    prisma.collection.count(),
    prisma.player.count({ where: { active: true } }),
    prisma.asset.aggregate({ _sum: { fileSize: true } }),
    prisma.asset.findMany({ orderBy: { uploadedAt: 'desc' }, take: 8, select: { id: true, title: true, assetUrl: true, fileType: true, eventName: true, uploadedAt: true } }),
    prisma.collection.findMany({ orderBy: { createdAt: 'desc' }, take: 5, include: { _count: { select: { assets: true } }, season: { select: { name: true } } } }),
  ]);

  const storageMB = ((sizeResult._sum.fileSize ?? 0) / 1024 / 1024).toFixed(1);

  return (
    <AppShell user={user}>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Overview of AB Media digital assets.</p>
        </div>
        <Link href="/upload" style={{ textDecoration: 'none' }}>
          <button className="btn-primary" type="button">+ Upload</button>
        </Link>
      </div>

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Total assets</div>
          <div className="stat-value">{assetCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Collections</div>
          <div className="stat-value">{collectionCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active players</div>
          <div className="stat-value">{playerCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Storage used</div>
          <div className="stat-value">{storageMB} MB</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, alignItems: 'start' }}>
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Recent uploads
            <Link href="/media" className="asset-link">View all →</Link>
          </div>
          {recentAssets.length === 0 ? (
            <div className="empty-state" style={{ padding: '32px 0' }}>
              <p>No assets yet. <Link href="/upload" className="asset-link">Upload the first.</Link></p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
              {recentAssets.map((a) => (
                <a key={a.id} href={`/media/${a.id}`} className="asset-card">
                  <div className="asset-thumb">
                    {a.fileType.startsWith('image/') ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/assets/${a.id}/download`} alt={a.title ?? a.id} />
                    ) : '🎬'}
                    {a.fileType.startsWith('video/') && <span className="video-badge">Video</span>}
                  </div>
                  <div className="asset-card-body">
                    <div className="asset-card-title">{a.title || a.eventName || 'Untitled'}</div>
                    <div className="asset-card-meta">{timeAgo(new Date(a.uploadedAt))}</div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Recent collections
            <Link href="/collections" className="asset-link">View all →</Link>
          </div>
          {recentCollections.length === 0 ? (
            <div className="empty-state" style={{ padding: '24px 0' }}><p>No collections yet.</p></div>
          ) : (
            <div className="config-list">
              {recentCollections.map((c) => (
                <Link
                  key={c.id}
                  href={'/collections/' + c.id}
                  className="config-item"
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  <div className="config-item-info">
                    <div className="config-item-title">{c.name}</div>
                    <div className="config-item-sub">
                      {c._count.assets} assets{c.season ? ' · ' + c.season.name : ''}
                    </div>
                  </div>
                  <span className="coll-type-badge">{c.type}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
