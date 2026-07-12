import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '../../../lib/auth';
import { prisma } from '../../../lib/db';
import AppShell from '../../../components/AppShell';
import AssetGallery from '../../../components/AssetGallery';
import TagReviewList from '../../../components/TagReviewList';

const PER_PAGE = 30;

export default async function SponsorPhotosPage({
  params, searchParams,
}: {
  params: { id: string };
  searchParams: { page?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const sponsor = await prisma.sponsor.findUnique({ where: { id: params.id } });
  if (!sponsor) notFound();

  const page = Math.max(1, parseInt(searchParams.page ?? '1'));

  const [suggestedTags, confirmedTags, total] = await Promise.all([
    prisma.assetSponsorTag.findMany({
      where: { sponsorId: sponsor.id, status: 'suggested' },
      include: { asset: { select: { id: true, title: true, fileType: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.assetSponsorTag.findMany({
      where: { sponsorId: sponsor.id, status: 'confirmed' },
      include: { asset: true },
      orderBy: { asset: { uploadedAt: 'desc' } },
      take: PER_PAGE,
      skip: (page - 1) * PER_PAGE,
    }),
    prisma.assetSponsorTag.count({ where: { sponsorId: sponsor.id, status: 'confirmed' } }),
  ]);

  const pages = Math.ceil(total / PER_PAGE);
  const assets = confirmedTags.map((t) => t.asset);

  return (
    <AppShell user={user}>
      <div className="page-header">
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div className="config-avatar" style={{ width: 56, height: 56, borderRadius: 8 }}>
            {sponsor.logoUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={`/api/sponsors/${sponsor.id}/logo`} alt={sponsor.name} />
              : sponsor.name.charAt(0)}
          </div>
          <div>
            <h1>{sponsor.name}</h1>
            <p>{sponsor.tier ? sponsor.tier : 'No tier'}</p>
          </div>
        </div>
        <Link href="/configure" style={{ textDecoration: 'none' }}>
          <button className="btn-secondary" type="button">Edit sponsor</button>
        </Link>
      </div>

      <TagReviewList
        kind="sponsor"
        items={suggestedTags.map((t) => ({
          tagId: t.id, assetId: t.asset.id, title: t.asset.title, fileType: t.asset.fileType, confidence: t.confidence,
        }))}
      />

      {assets.length === 0 ? (
        <div className="empty-state card">
          <h3>No confirmed photos yet</h3>
          <p>Photos will appear here once sponsor matches are confirmed.</p>
        </div>
      ) : (
        <>
          <AssetGallery assets={assets} metaMode="date" />
          {pages > 1 && (
            <div className="pagination">
              <a
                href={`/sponsors/${sponsor.id}?page=${page - 1}`}
                className="btn-secondary"
                style={{ pointerEvents: page <= 1 ? 'none' : 'auto', opacity: page <= 1 ? 0.4 : 1, textDecoration: 'none' }}
              >
                ← Prev
              </a>
              <span className="page-info">Page {page} of {pages} · {total} total</span>
              <a
                href={`/sponsors/${sponsor.id}?page=${page + 1}`}
                className="btn-secondary"
                style={{ pointerEvents: page >= pages ? 'none' : 'auto', opacity: page >= pages ? 0.4 : 1, textDecoration: 'none' }}
              >
                Next →
              </a>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
