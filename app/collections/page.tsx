import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '../../lib/auth';
import { prisma } from '../../lib/db';
import AppShell from '../../components/AppShell';
import NewCollectionForm from '../../components/NewCollectionForm';

export default async function CollectionsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const [collections, seasons] = await Promise.all([
    prisma.collection.findMany({
      orderBy: { date: 'desc' },
      include: {
        season: { select: { name: true } },
        _count: { select: { assets: true } },
        assets: {
          take: 1,
          where: { fileType: { startsWith: 'image/' } },
          select: { id: true },
          orderBy: { uploadedAt: 'asc' },
        },
      },
    }),
    prisma.season.findMany({ orderBy: { startDate: 'desc' }, select: { id: true, name: true } }),
  ]);

  return (
    <AppShell user={user}>
      <div className="page-header">
        <div>
          <h1>Collections</h1>
          <p>{collections.length} collection{collections.length !== 1 ? 's' : ''} · games and events</p>
        </div>
        <NewCollectionForm seasons={seasons} />
      </div>

      {collections.length === 0 ? (
        <div className="empty-state card">
          <h3>No collections yet</h3>
          <p>Create a collection to group assets from a game or event.</p>
        </div>
      ) : (
        <div className="collection-grid">
          {collections.map((c) => {
            const coverId = c.assets[0]?.id;
            return (
              <Link key={c.id} href={'/collections/' + c.id} className="collection-card">
                <div className="collection-cover">
                  {coverId ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/assets/${coverId}/download`} alt={c.name} />
                  ) : '📁'}
                </div>
                <div className="collection-card-body">
                  <div className="collection-card-name">{c.name}</div>
                  <div className="collection-card-meta">
                    <span className="coll-type-badge">{c.type}</span>
                    {c.date && (
                      <span>
                        {new Date(c.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                    {c.season && <span>{c.season.name}</span>}
                    <span>{c._count.assets} assets</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
