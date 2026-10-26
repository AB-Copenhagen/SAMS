import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { applyShareFilters, getPublicCollectionByToken, resolveCollectionGalleryAssets, sanitizePublicAsset } from '../../../lib/collections';
import { isShareUnlocked } from '../../../lib/share-auth';
import { logShareEvent } from '../../../lib/share-analytics';
import { attachThumbnailUrls } from '../../../lib/thumbnail';
import SharePasswordForm from '../../../components/SharePasswordForm';
import PublicAssetGallery from '../../../components/PublicAssetGallery';

export default async function SharedCollectionPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;

  const collection = await getPublicCollectionByToken(token);
  if (!collection || !collection.isPublic) notFound();

  const unlocked = collection.sharePasswordHash ? await isShareUnlocked(token) : true;
  if (!unlocked) {
    return <SharePasswordForm token={token} name={collection.name} />;
  }

  const h = await headers();
  await logShareEvent({
    kind: 'view',
    token,
    collectionId: collection.id,
    ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
    userAgent: h.get('user-agent'),
  });

  const assets = applyShareFilters(await resolveCollectionGalleryAssets(collection), collection);
  // Batch-presigned once here instead of every gallery image round-tripping through
  // /api/share/[token]/assets/[id]/thumbnail on its own — same fix as the Media Library's
  // gallery (app/media/page.tsx), just as important for a public link an external viewer expects
  // to load instantly.
  const publicAssets = await attachThumbnailUrls(assets.map(sanitizePublicAsset));

  return (
    <div className="share-page" style={{ maxWidth: 2000 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/AB1889.png" alt="AB Copenhagen" style={{ width: 40, height: 40 }} />
        <div>
          <h1 style={{ margin: 0 }}>{collection.name}</h1>
          <p style={{ margin: 0, color: '#6b7491', fontSize: 13 }}>{publicAssets.length} item{publicAssets.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {publicAssets.length === 0 ? (
        <div className="empty-state card">
          <h3>Nothing here yet</h3>
          <p>Check back later.</p>
        </div>
      ) : (
        <PublicAssetGallery token={token} assets={publicAssets} />
      )}
    </div>
  );
}
