import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '../../lib/auth';
import { listPlaylists } from '../../lib/playlists';
import AppShell from '../../components/AppShell';
import NewPlaylistForm from '../../components/NewPlaylistForm';

export default async function PlaylistsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const playlists = await listPlaylists();

  return (
    <AppShell user={user}>
      <div className="page-header">
        <div>
          <h1>Playlists</h1>
          <p>{playlists.length} playlist{playlists.length !== 1 ? 's' : ''} · ordered video sets for playlist embeds</p>
        </div>
        <NewPlaylistForm />
      </div>

      {playlists.length === 0 ? (
        <div className="empty-state card">
          <h3>No playlists yet</h3>
          <p>Create one, then add videos to it in the order you want them to play.</p>
        </div>
      ) : (
        <div className="asset-table-wrap">
          <table className="asset-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Videos</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {playlists.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/playlists/${p.id}`} style={{ fontWeight: 600, color: '#12141f', textDecoration: 'none' }} className="row-link">
                      {p.name}
                    </Link>
                  </td>
                  <td>{p._count.items}</td>
                  <td>{p.createdAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
