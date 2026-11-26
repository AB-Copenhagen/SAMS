import { notFound } from 'next/navigation';
import {
  resolveEmbedTarget,
  resolveCollectionGalleryAssets,
  applyShareFilters,
  sanitizePublicAsset,
} from '../../../lib/collections';
import { attachThumbnailUrls } from '../../../lib/thumbnail';
import VideoPlayer from '../../../components/VideoPlayer';
import EmbedGallery from '../../../components/EmbedGallery';
import EmbedBridge from '../../../components/EmbedBridge';
import EmbedPlaylistPlayer from '../../../components/EmbedPlaylistPlayer';

// Chromeless by construction, not by an explicit opt-out: AppShell (the staff header/nav) is only
// ever rendered where a page imports it directly (see app/media/[id]/page.tsx) — same reason
// app/s/[token]/page.tsx already renders chromeless today. No staff auth here: this is reached
// purely through resolveEmbedTarget's own token check.
export default async function EmbedPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;

  const target = await resolveEmbedTarget(token);
  if (!target) notFound();

  if (target.kind === 'asset') {
    const { asset } = target;
    const isVideo = asset.fileType.startsWith('video/');
    return (
      <div style={{ margin: 0, background: '#0d0f1c' }}>
        <EmbedBridge />
        {isVideo ? (
          <VideoPlayer
            src={`/api/embed/${token}/assets/${asset.id}/download`}
            hlsSrc={asset.hlsStatus === 'done' ? `/api/embed/${token}/assets/${asset.id}/hls/master.m3u8` : null}
            controls
            style={{ width: '100%', display: 'block' }}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/embed/${token}/assets/${asset.id}/preview`}
            alt={asset.title ?? ''}
            style={{ width: '100%', display: 'block' }}
          />
        )}
      </div>
    );
  }

  if (target.kind === 'playlist') {
    const { playlist } = target;
    if (playlist.items.length === 0) notFound(); // nothing to play — shouldn't normally happen, addPlaylistItem/resolveEmbedTarget don't filter an empty playlist out themselves
    return (
      <EmbedPlaylistPlayer
        token={token}
        items={playlist.items.map((i) => ({ id: i.asset.id, hlsStatus: i.asset.hlsStatus }))}
      />
    );
  }

  const { collection } = target;
  const assets = applyShareFilters(await resolveCollectionGalleryAssets(collection), collection);
  const publicAssets = await attachThumbnailUrls(assets.map(sanitizePublicAsset));

  return (
    <div style={{ margin: 0 }}>
      <EmbedBridge />
      <EmbedGallery token={token} assets={publicAssets} />
    </div>
  );
}
