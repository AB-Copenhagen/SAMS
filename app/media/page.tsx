import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getCurrentUser } from '../../lib/auth';
import { prisma } from '../../lib/db';
import AppShell from '../../components/AppShell';
import MediaFilterBar from '../../components/MediaFilterBar';
import PerPageSelector from '../../components/PerPageSelector';
import AssetGallery from '../../components/AssetGallery';

const PER_PAGE_OPTIONS = [25, 50, 100];

type SearchParams = { q?: string; type?: string; seasonId?: string; category?: string; page?: string; perPage?: string };

export default async function MediaPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const q        = searchParams.q ?? '';
  const type     = searchParams.type ?? '';
  const seasonId = searchParams.seasonId ?? '';
  const category = searchParams.category ?? '';
  const page     = Math.max(1, parseInt(searchParams.page ?? '1'));
  const perPage  = PER_PAGE_OPTIONS.includes(parseInt(searchParams.perPage ?? '')) ? parseInt(searchParams.perPage!) : 25;

  const AND: Record<string, unknown>[] = [];
  if (q)       AND.push({ OR: [{ title: { contains: q } }, { eventName: { contains: q } }, { location: { contains: q } }, { detectedTagsJson: { contains: q } }, { manualTagsJson: { contains: q } }] });
  if (type === 'image') AND.push({ fileType: { startsWith: 'image/' } });
  if (type === 'video') AND.push({ fileType: { startsWith: 'video/' } });
  if (seasonId) AND.push({ seasonId });
  if (category) AND.push({ category });

  const where = AND.length ? { AND } : {};

  const [assets, total, seasons] = await Promise.all([
    prisma.asset.findMany({ where, orderBy: { uploadedAt: 'desc' }, take: perPage, skip: (page - 1) * perPage }),
    prisma.asset.count({ where }),
    prisma.season.findMany({ orderBy: { startDate: 'desc' }, select: { id: true, name: true } }),
  ]);

  const pages      = Math.ceil(total / perPage);
  const isFiltered = !!(q || type || seasonId || category);

  function pageUrl(p: number) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (type) params.set('type', type);
    if (seasonId) params.set('seasonId', seasonId);
    if (category) params.set('category', category);
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
        <MediaFilterBar seasons={seasons} />
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
