import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import { getCurrentUser } from '../../lib/auth';
import { prisma } from '../../lib/db';
import AppShell from '../../components/AppShell';
import NewCollectionForm from '../../components/NewCollectionForm';
import PerPageSelector from '../../components/PerPageSelector';

const PER_PAGE_OPTIONS = [25, 50, 100];

type View = 'event' | 'player' | 'sponsor';
type SearchParams = { page?: string; perPage?: string; view?: string };

function viewUrl(view: View, perPage: number) {
  const params = new URLSearchParams();
  if (view !== 'event') params.set('view', view);
  if (perPage !== 25) params.set('perPage', String(perPage));
  const s = params.toString();
  return '/collections' + (s ? '?' + s : '');
}

export default async function CollectionsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const view: View = searchParams.view === 'player' || searchParams.view === 'sponsor' ? searchParams.view : 'event';
  const page    = Math.max(1, parseInt(searchParams.page ?? '1'));
  const perPage = PER_PAGE_OPTIONS.includes(parseInt(searchParams.perPage ?? '')) ? parseInt(searchParams.perPage!) : 25;

  const [total, collections, seasons] = await Promise.all([
    prisma.collection.count(),
    view === 'event'
      ? prisma.collection.findMany({
          orderBy: { date: 'desc' },
          take: perPage,
          skip: (page - 1) * perPage,
          include: {
            season: { select: { name: true } },
            _count: { select: { assets: true } },
          },
        })
      : Promise.resolve([]),
    prisma.season.findMany({ orderBy: { startDate: 'desc' }, select: { id: true, name: true } }),
  ]);

  const players = view === 'player'
    ? await prisma.player.findMany({
        include: { _count: { select: { assetTags: { where: { status: 'confirmed' } } } } },
      })
    : [];
  const sortedPlayers = [...players].sort((a, b) =>
    b._count.assetTags - a._count.assetTags || a.name.localeCompare(b.name));

  const sponsors = view === 'sponsor'
    ? await prisma.sponsor.findMany({
        include: { _count: { select: { assetTags: { where: { status: 'confirmed' } } } } },
      })
    : [];
  const sortedSponsors = [...sponsors].sort((a, b) =>
    b._count.assetTags - a._count.assetTags || a.name.localeCompare(b.name));

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
          <p>
            {view === 'event' && `${total} collection${total !== 1 ? 's' : ''} · games and events`}
            {view === 'player' && `${sortedPlayers.length} player${sortedPlayers.length !== 1 ? 's' : ''}`}
            {view === 'sponsor' && `${sortedSponsors.length} sponsor${sortedSponsors.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {view === 'event' && (
            <Suspense>
              <PerPageSelector options={PER_PAGE_OPTIONS} current={perPage} />
            </Suspense>
          )}
          {view === 'event' && <NewCollectionForm seasons={seasons} />}
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 16 }}>
        <Link href={viewUrl('event', perPage)} className={'tab-btn' + (view === 'event' ? ' active' : '')}>By Event</Link>
        <Link href={viewUrl('player', perPage)} className={'tab-btn' + (view === 'player' ? ' active' : '')}>By Player</Link>
        <Link href={viewUrl('sponsor', perPage)} className={'tab-btn' + (view === 'sponsor' ? ' active' : '')}>By Sponsor</Link>
      </div>

      {view === 'player' && (
        sortedPlayers.length === 0 ? (
          <div className="empty-state card"><h3>No players yet</h3><p>Add players in Configure.</p></div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f7f8fc', borderBottom: '1px solid #e8eaf4' }}>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#3b4070' }}>Name</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#3b4070' }}>Team</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, color: '#3b4070' }}>Photos</th>
                </tr>
              </thead>
              <tbody>
                {sortedPlayers.map((p, i) => (
                  <tr key={p.id} style={{ borderBottom: i < sortedPlayers.length - 1 ? '1px solid #f0f2f7' : undefined }}>
                    <td style={{ padding: '10px 16px' }}>
                      <Link href={`/players/${p.id}`} style={{ fontWeight: 600, color: '#12141f', textDecoration: 'none' }} className="row-link">
                        {p.name}{p.number != null ? ` #${p.number}` : ''}
                      </Link>
                    </td>
                    <td style={{ padding: '10px 16px', color: '#6b7491' }}>{p.team ?? '—'}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', color: '#6b7491' }}>{p._count.assetTags}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {view === 'sponsor' && (
        sortedSponsors.length === 0 ? (
          <div className="empty-state card"><h3>No sponsors yet</h3><p>Add sponsors in Configure.</p></div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f7f8fc', borderBottom: '1px solid #e8eaf4' }}>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#3b4070' }}>Name</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#3b4070' }}>Tier</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, color: '#3b4070' }}>Photos</th>
                </tr>
              </thead>
              <tbody>
                {sortedSponsors.map((s, i) => (
                  <tr key={s.id} style={{ borderBottom: i < sortedSponsors.length - 1 ? '1px solid #f0f2f7' : undefined }}>
                    <td style={{ padding: '10px 16px' }}>
                      <Link href={`/sponsors/${s.id}`} style={{ fontWeight: 600, color: '#12141f', textDecoration: 'none' }} className="row-link">
                        {s.name}
                      </Link>
                    </td>
                    <td style={{ padding: '10px 16px', color: '#6b7491' }}>{s.tier ?? '—'}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', color: '#6b7491' }}>{s._count.assetTags}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {view === 'event' && (total === 0 ? (
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
      ))}

      {view === 'event' && pages > 1 && (
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
