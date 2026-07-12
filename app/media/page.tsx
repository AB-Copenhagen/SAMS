import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getCurrentUser } from '../../lib/auth';
import { prisma } from '../../lib/db';
import AppShell from '../../components/AppShell';
import MediaFilterBar from '../../components/MediaFilterBar';
import PerPageSelector from '../../components/PerPageSelector';
import AssetGallery from '../../components/AssetGallery';

const PER_PAGE_OPTIONS = [25, 50, 100];

type SearchParams = {
  q?: string; type?: string; seasonId?: string; category?: string;
  collectionId?: string; playerIds?: string; sponsorIds?: string; rating?: string;
  page?: string; perPage?: string;
};

export default async function MediaPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const q            = searchParams.q ?? '';
  const type         = searchParams.type ?? '';
  const seasonId     = searchParams.seasonId ?? '';
  const category     = searchParams.category ?? '';
  const collectionId = searchParams.collectionId ?? '';
  const playerIds    = searchParams.playerIds ? searchParams.playerIds.split(',').filter(Boolean) : [];
  const sponsorIds   = searchParams.sponsorIds ? searchParams.sponsorIds.split(',').filter(Boolean) : [];
  const rating       = [1, 2, 3, 4].includes(parseInt(searchParams.rating ?? '')) ? parseInt(searchParams.rating!) : 0;
  const page     = Math.max(1, parseInt(searchParams.page ?? '1'));
  const perPage  = PER_PAGE_OPTIONS.includes(parseInt(searchParams.perPage ?? '')) ? parseInt(searchParams.perPage!) : 25;

  const AND: Record<string, unknown>[] = [];
  if (q)       AND.push({ OR: [{ title: { contains: q } }, { eventName: { contains: q } }, { location: { contains: q } }, { detectedTagsJson: { contains: q } }, { manualTagsJson: { contains: q } }] });
  if (type === 'image') AND.push({ fileType: { startsWith: 'image/' } });
  if (type === 'video') AND.push({ fileType: { startsWith: 'video/' } });
  if (seasonId) AND.push({ seasonId });
  if (category) AND.push({ category });
  if (collectionId) AND.push({ collectionId });
  if (playerIds.length)  AND.push({ playerTags:  { some: { playerId:  { in: playerIds  }, status: 'confirmed' } } });
  if (sponsorIds.length) AND.push({ sponsorTags: { some: { sponsorId: { in: sponsorIds }, status: 'confirmed' } } });
  if (rating) AND.push({ rating: { gte: rating } });

  const where = AND.length ? { AND } : {};

  const [assets, total, seasons, collections, players, sponsors] = await Promise.all([
    prisma.asset.findMany({ where, orderBy: { uploadedAt: 'desc' }, take: perPage, skip: (page - 1) * perPage }),
    prisma.asset.count({ where }),
    prisma.season.findMany({ orderBy: { startDate: 'desc' }, select: { id: true, name: true } }),
    prisma.collection.findMany({ orderBy: { date: 'desc' }, select: { id: true, name: true, date: true } }),
    prisma.player.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, number: true } }),
    prisma.sponsor.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);

  const pages      = Math.ceil(total / perPage);
  const isFiltered = !!(q || type || seasonId || category || collectionId || playerIds.length || sponsorIds.length || rating);

  function pageUrl(p: number) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (type) params.set('type', type);
    if (seasonId) params.set('seasonId', seasonId);
    if (category) params.set('category', category);
    if (collectionId) params.set('collectionId', collectionId);
    if (playerIds.length) params.set('playerIds', playerIds.join(','));
    if (sponsorIds.length) params.set('sponsorIds', sponsorIds.join(','));
    if (rating) params.set('rating', String(rating));
    if (perPage !== 25) params.set('perPage', String(perPage));
    if (p > 1) params.set('page', String(p));
    const s = params.toString();
    return '/media' + (s ? '?' + s : '');
  }

  return (
    <AppShell user={user}>
      <div className="page-header">
        <div>
          <h1>Media Library</h1>
          <p>{total} asset{total !== 1 ? 's' : ''}{isFiltered ? ' (filtered)' : ''}</p>
        </div>
        <Suspense>
          <PerPageSelector options={PER_PAGE_OPTIONS} current={perPage} />
        </Suspense>
      </div>

      <Suspense>
        <MediaFilterBar seasons={seasons} collections={collections} players={players} sponsors={sponsors} />
      </Suspense>

      {assets.length === 0 ? (
        <div className="empty-state card">
          <h3>No assets found</h3>
          <p>Try adjusting your filters or upload new files.</p>
        </div>
      ) : (
        <AssetGallery assets={assets} metaMode="date" />
      )}

      {assets.length > 0 && (
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
