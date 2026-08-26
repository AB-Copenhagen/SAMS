import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '../../../lib/auth';
import { prisma } from '../../../lib/db';
import { resolveCollectionAssets } from '../../../lib/collections';
import AppShell from '../../../components/AppShell';
import CollectionEditForm from '../../../components/CollectionEditForm';
import CollectionSharePanel from '../../../components/CollectionSharePanel';
import CollectionRulesEditor from '../../../components/CollectionRulesEditor';
import CollectionAssetPicker from '../../../components/CollectionAssetPicker';
import AssetGallery from '../../../components/AssetGallery';

export default async function CollectionPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const collection = await prisma.collection.findUnique({
    where: { id: params.id },
    include: {
      season: true,
      stadium: true,
      // Trimmed to exactly what AssetGallery renders — the untrimmed relation was pulling every
      // column (including several large JSON blobs) for every asset in the collection on each open.
      assets: {
        orderBy: { uploadedAt: 'desc' },
        select: {
          id: true, title: true, eventName: true, eventDate: true, location: true,
          fileType: true, fileSize: true, thumbnailKey: true, thumbnailStatus: true,
        },
      },
      playerRules: { include: { player: true } },
      sponsorRules: { include: { sponsor: true } },
    },
  });
  if (!collection) notFound();

  const isCustom = collection.type === 'custom';
  const assets = isCustom ? await resolveCollectionAssets(collection) : collection.assets;

  const [allPlayers, allSponsors] = isCustom
    ? await Promise.all([
        prisma.player.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, number: true } }),
        prisma.sponsor.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
      ])
    : [[], []];

  const appBaseUrl = (process.env.PUBLIC_SHARE_BASE_URL ?? process.env.APP_BASE_URL ?? '').replace(/\/$/, '');

  return (
    <AppShell user={user} wide>
      <div className="breadcrumb">
        <Link href="/collections">Collections</Link>
        <span className="breadcrumb-sep">›</span>
        <span>{collection.name}</span>
      </div>

      {/* Capped — these are simple forms (edit/share/rules/picker), not a grid, so they stay
          readable instead of stretching to the page's full uncapped width. Only the gallery below
          benefits from that extra width, same split as the stat row/config panels on /home. */}
      <div style={{ maxWidth: 1100 }}>
        <div className="page-header">
          <div>
            <h1>{collection.name}</h1>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6, alignItems: 'center' }}>
              <span className="coll-type-badge">{collection.type}</span>
              {collection.date && (
                <span style={{ color: '#6b7491', fontSize: 13 }}>
                  {new Date(collection.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              )}
              {collection.opponent && (
                <span style={{ color: '#6b7491', fontSize: 13 }}>vs {collection.opponent}</span>
              )}
              {collection.season && (
                <span style={{ color: '#6b7491', fontSize: 13 }}>{collection.season.name}</span>
              )}
              {collection.venue && (
                <span style={{ color: '#6b7491', fontSize: 13 }}>📍 {collection.venue}</span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ color: '#8890b4', fontSize: 13 }}>{assets.length} assets</span>
            <CollectionEditForm
              id={collection.id}
              name={collection.name}
              date={collection.date ? collection.date.toISOString().split('T')[0] : null}
              opponent={collection.opponent}
              venue={collection.venue}
              isCustom={isCustom}
            />
          </div>
        </div>

        {isCustom && (
          <>
            <CollectionSharePanel
              id={collection.id}
              isPublic={collection.isPublic}
              hasPassword={Boolean(collection.sharePasswordHash)}
              shareToken={collection.shareToken}
              appBaseUrl={appBaseUrl}
              shareMinRating={collection.shareMinRating}
              shareDateRangeDays={collection.shareDateRangeDays}
              expiresAt={collection.expiresAt}
            />
            <CollectionRulesEditor
              collectionId={collection.id}
              playerRules={collection.playerRules}
              sponsorRules={collection.sponsorRules}
              allPlayers={allPlayers}
              allSponsors={allSponsors}
            />
            <CollectionAssetPicker collectionId={collection.id} existingAssetIds={assets.map((a) => a.id)} />
          </>
        )}
      </div>

      {assets.length === 0 ? (
        <div className="empty-state card">
          <h3>No assets in this collection</h3>
          <p>{isCustom ? 'Add assets manually above, or set up an auto-include rule.' : 'Upload assets and assign them to this collection.'}</p>
          {!isCustom && (
            <Link href="/upload" style={{ textDecoration: 'none', display: 'inline-block', marginTop: 12 }}>
              <button className="btn-primary" type="button">Upload assets</button>
            </Link>
          )}
        </div>
      ) : (
        <AssetGallery assets={assets} metaMode="filesize" collectionId={collection.id} />
      )}
    </AppShell>
  );
}
