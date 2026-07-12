import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '../../../lib/auth';
import { prisma } from '../../../lib/db';
import AppShell from '../../../components/AppShell';
import CollectionEditForm from '../../../components/CollectionEditForm';
import AssetGallery from '../../../components/AssetGallery';

export default async function CollectionPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const collection = await prisma.collection.findUnique({
    where: { id: params.id },
    include: { season: true, stadium: true, assets: { orderBy: { uploadedAt: 'desc' } } },
  });
  if (!collection) notFound();

  return (
    <AppShell user={user}>
      <div className="breadcrumb">
        <Link href="/collections">Collections</Link>
        <span className="breadcrumb-sep">›</span>
        <span>{collection.name}</span>
      </div>

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
          <span style={{ color: '#8890b4', fontSize: 13 }}>{collection.assets.length} assets</span>
          <CollectionEditForm
            id={collection.id}
            name={collection.name}
            date={collection.date ? collection.date.toISOString().split('T')[0] : null}
            opponent={collection.opponent}
            venue={collection.venue}
          />
        </div>
      </div>

      {collection.assets.length === 0 ? (
        <div className="empty-state card">
          <h3>No assets in this collection</h3>
          <p>Upload assets and assign them to this collection.</p>
          <Link href="/upload" style={{ textDecoration: 'none', display: 'inline-block', marginTop: 12 }}>
            <button className="btn-primary" type="button">Upload assets</button>
          </Link>
        </div>
      ) : (
        <AssetGallery assets={collection.assets} metaMode="filesize" />
      )}
    </AppShell>
  );
}
