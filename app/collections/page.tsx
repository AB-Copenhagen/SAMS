import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import { getCurrentUser } from '../../lib/auth';
import { prisma } from '../../lib/db';
import AppShell from '../../components/AppShell';
import NewCollectionForm from '../../components/NewCollectionForm';
import PerPageSelector from '../../components/PerPageSelector';

const PER_PAGE_OPTIONS = [25, 50, 100];

type SearchParams = { page?: string; perPage?: string };

export default async function CollectionsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const page    = Math.max(1, parseInt(searchParams.page ?? '1'));
  const perPage = PER_PAGE_OPTIONS.includes(parseInt(searchParams.perPage ?? '')) ? parseInt(searchParams.perPage!) : 25;

  const [total, collections, seasons] = await Promise.all([
    prisma.collection.count(),
    prisma.collection.findMany({
      orderBy: { date: 'desc' },
      take: perPage,
      skip: (page - 1) * perPage,
      include: {
        season: { select: { name: true } },
        _count: { select: { assets: true } },
      },
    }),
    prisma.season.findMany({ orderBy: { startDate: 'desc' }, select: { id: true, name: true } }),
  ]);

  const pages = Math.ceil(total / perPage);

  function pageUrl(p: number) {
    const params = new URLSearchParams();
    if (perPage !== 25) params.set('perPage', String(perPage));
    if (p > 1) params.set('page', String(p));
    const s = params.toString();
    return '/collections' + (s ? '?' + s : '');
  }

  return (
    <AppShell user={user}>
      <div className="page-header">
        <div>
          <h1>Collections</h1>
          <p>{total} collection{total !== 1 ? 's' : ''} · games and events</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Suspense>
            <PerPageSelector options={PER_PAGE_OPTIONS} current={perPage} />
          </Suspense>
          <NewCollectionForm seasons={seasons} />
        </div>
      </div>

      {total === 0 ? (
        <div className="empty-state card">
          <h3>No collections yet</h3>
          <p>Create a collection to group assets from a game or event.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f7f8fc', borderBottom: '1px solid #e8eaf4' }}>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#3b4070' }}>Name</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#3b4070' }}>Date</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#3b4070' }}>Type</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#3b4070' }}>Season</th>
                <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, color: '#3b4070' }}>Assets</th>
              </tr>
            </thead>
            <tbody>
              {collections.map((c, i) => (
                <tr
                  key={c.id}
                  style={{ borderBottom: i < collections.length - 1 ? '1px solid #f0f2f7' : undefined }}
                >
                  <td style={{ padding: '10px 16px' }}>
                    <Link
                      href={`/collections/${c.id}`}
                      style={{ fontWeight: 600, color: '#12141f', textDecoration: 'none' }}
                      className="row-link"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td style={{ padding: '10px 16px', color: '#6b7491', whiteSpace: 'nowrap' }}>
                    {c.date
                      ? new Date(c.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                      : '—'}
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    <span className="coll-type-badge">{c.type}</span>
                  </td>
                  <td style={{ padding: '10px 16px', color: '#6b7491' }}>{c.season?.name ?? '—'}</td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', color: '#6b7491' }}>{c._count.assets}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="pagination">
          <a
            href={pageUrl(page - 1)}
            className="btn-secondary"
            style={{ pointerEvents: page <= 1 ? 'none' : 'auto', opacity: page <= 1 ? 0.4 : 1, textDecoration: 'none' }}
          >
            ← Prev
          </a>
          <span className="page-info">Page {page} of {pages} · {total} total</span>
          <a
            href={pageUrl(page + 1)}
            className="btn-secondary"
            style={{ pointerEvents: page >= pages ? 'none' : 'auto', opacity: page >= pages ? 0.4 : 1, textDecoration: 'none' }}
          >
            Next →
          </a>
        </div>
      )}
    </AppShell>
  );
}
