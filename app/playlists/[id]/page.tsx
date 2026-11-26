import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '../../../lib/auth';
import { prisma } from '../../../lib/db';
import { getPlaylistWithItems } from '../../../lib/playlists';
import AppShell from '../../../components/AppShell';
import PlaylistEditForm from '../../../components/PlaylistEditForm';
import PlaylistItemsEditor from '../../../components/PlaylistItemsEditor';
import PlaylistItemPicker from '../../../components/PlaylistItemPicker';
import EmbedPanel from '../../../components/EmbedPanel';

export default async function PlaylistPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const playlist = await getPlaylistWithItems(params.id);
  if (!playlist) notFound();

  const assets = playlist.items.map((item) => item.asset);

  const appBaseUrl = (process.env.PUBLIC_SHARE_BASE_URL ?? process.env.APP_BASE_URL ?? '').replace(/\/$/, '');
  const embedTokens = await prisma.embedToken.findMany({
    where: { targetType: 'playlist', targetId: playlist.id, revokedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { token: true, createdAt: true, createdBy: true },
  });

  return (
    <AppShell user={user}>
      <div className="breadcrumb">
        <Link href="/playlists">Playlists</Link>
        <span className="breadcrumb-sep">›</span>
        <span>{playlist.name}</span>
      </div>

      <div style={{ maxWidth: 1100 }}>
        <div className="page-header">
          <div>
            <h1>{playlist.name}</h1>
            <p style={{ color: '#6b7491', fontSize: 13 }}>
              {assets.length} video{assets.length !== 1 ? 's' : ''} · plays in the order below
            </p>
          </div>
          <PlaylistEditForm id={playlist.id} name={playlist.name} />
        </div>

        <EmbedPanel
          targetType="playlist"
          targetId={playlist.id}
          appBaseUrl={appBaseUrl}
          initialTokens={embedTokens.map((t) => ({ token: t.token, createdAt: t.createdAt.toISOString(), createdBy: t.createdBy }))}
        />

        <PlaylistItemsEditor playlistId={playlist.id} items={assets} />
        <PlaylistItemPicker playlistId={playlist.id} existingAssetIds={assets.map((a) => a.id)} />
      </div>
    </AppShell>
  );
}
