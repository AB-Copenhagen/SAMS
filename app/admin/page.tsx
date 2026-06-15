import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '../../lib/auth';
import { prisma } from '../../lib/db';
import AppShell from '../../components/AppShell';

function typeBadge(fileType: string) {
  if (fileType.startsWith('image/')) return <span className="type-badge badge-image">Image</span>;
  if (fileType.startsWith('video/')) return <span className="type-badge badge-video">Video</span>;
  return <span className="type-badge">{fileType}</span>;
}

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') redirect('/login');

  const assets = await prisma.asset.findMany({ orderBy: { uploadedAt: 'desc' } });

  const imageCount = assets.filter((a) => a.fileType.startsWith('image/')).length;
  const videoCount = assets.filter((a) => a.fileType.startsWith('video/')).length;
  const totalMB = (assets.reduce((sum, a) => sum + (a.fileSize ?? 0), 0) / 1024 / 1024).toFixed(1);

  return (
    <AppShell user={user}>
      <div className="page-header">
        <div>
          <h1>Asset Library</h1>
          <p>All uploaded photos and videos.</p>
        </div>
        <Link href="/upload" style={{ textDecoration: 'none' }}>
          <button className="btn-primary" type="button">+ Upload</button>
        </Link>
      </div>

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Total assets</div>
          <div className="stat-value">{assets.length}</div>
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
          <div className="stat-label">Storage used</div>
          <div className="stat-value">{totalMB} MB</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {assets.length === 0 ? (
          <div style={{ padding: '48px 32px', textAlign: 'center', color: '#8890b4' }}>
            No assets yet. <Link href="/upload" className="asset-link">Upload the first one.</Link>
          </div>
        ) : (
          <div className="asset-table-wrap">
            <table className="asset-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Event</th>
                  <th>Type</th>
                  <th>Size</th>
                  <th>Uploaded</th>
                  <th>Tags</th>
                  <th>File</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((asset) => {
                  const tags: string[] = asset.detectedTagsJson
                    ? JSON.parse(asset.detectedTagsJson)
                    : [];
                  return (
                    <tr key={asset.id}>
                      <td style={{ fontWeight: 500 }}>{asset.title || '—'}</td>
                      <td>{asset.eventName || '—'}</td>
                      <td>{typeBadge(asset.fileType)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {asset.fileSize ? `${(asset.fileSize / 1024 / 1024).toFixed(1)} MB` : '—'}
                      </td>
                      <td style={{ whiteSpace: 'nowrap', color: '#8890b4' }}>
                        {new Date(asset.uploadedAt).toLocaleDateString()}
                      </td>
                      <td style={{ color: '#6b7491', fontSize: 12 }}>
                        {tags.length ? tags.slice(0, 4).join(', ') : '—'}
                      </td>
                      <td>
                        <a
                          href={asset.assetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="asset-link"
                        >
                          Open ↗
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
