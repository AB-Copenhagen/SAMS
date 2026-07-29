import { notFound } from 'next/navigation';
import { applyShareFilters, getPublicCollectionByToken, resolveCollectionAssets, sanitizePublicAsset } from '../../../lib/collections';
import { isShareUnlocked } from '../../../lib/share-auth';
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

  const assets = applyShareFilters(await resolveCollectionAssets(collection), collection);
  const publicAssets = assets.map(sanitizePublicAsset);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
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
