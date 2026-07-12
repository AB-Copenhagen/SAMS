import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '../../../lib/auth';
import { prisma } from '../../../lib/db';
import AppShell from '../../../components/AppShell';
import AssetGallery from '../../../components/AssetGallery';
import TagReviewList from '../../../components/TagReviewList';

const PER_PAGE = 30;

export default async function PlayerPhotosPage({
  params, searchParams,
}: {
  params: { id: string };
  searchParams: { page?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const player = await prisma.player.findUnique({
    where: { id: params.id },
    include: { season: { select: { id: true, name: true } } },
  });
  if (!player) notFound();

  const page = Math.max(1, parseInt(searchParams.page ?? '1'));

  // A photo can be matched to a player via more than one source (face + jersey-ocr), which
  // creates multiple confirmed/suggested rows for the same (playerId, assetId) pair by design
  // (each source tracks its own confirmation independently) — `distinct: ['assetId']` collapses
  // those back to one row per photo for display/pagination purposes.
  const [suggestedTags, confirmedTags, distinctConfirmed] = await Promise.all([
    prisma.assetPlayerTag.findMany({
      where: { playerId: player.id, status: 'suggested' },
      include: { asset: { select: { id: true, title: true, fileType: true } } },
      orderBy: { createdAt: 'desc' },
      distinct: ['assetId'],
    }),
    prisma.assetPlayerTag.findMany({
      where: { playerId: player.id, status: 'confirmed' },
      include: { asset: true },
      orderBy: { asset: { uploadedAt: 'desc' } },
      distinct: ['assetId'],
      take: PER_PAGE,
      skip: (page - 1) * PER_PAGE,
    }),
    prisma.assetPlayerTag.findMany({
      where: { playerId: player.id, status: 'confirmed' },
      select: { assetId: true },
      distinct: ['assetId'],
    }),
  ]);
  const total = distinctConfirmed.length;

  const pages = Math.ceil(total / PER_PAGE);
  const assets = confirmedTags.map((t) => t.asset);

  return (
    <AppShell user={user}>
      <div className="page-header">
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div className="config-avatar" style={{ width: 56, height: 56 }}>
            {player.headshotUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={`/api/players/${player.id}/headshot`} alt={player.name} />
              : player.name.charAt(0)}
          </div>
          <div>
            <h1>{player.name}{player.number != null ? ` #${player.number}` : ''}</h1>
            <p>
              {[player.position, player.team, player.season?.name].filter(Boolean).join(' · ') || 'No details'}
              {' · '}{player.faceEnrolledAt ? 'Face enrolled' : 'Face not enrolled'}
            </p>
          </div>
        </div>
        <Link href="/configure" style={{ textDecoration: 'none' }}>
          <button className="btn-secondary" type="button">Edit player</button>
        </Link>
      </div>

      <TagReviewList
        kind="player"
        items={suggestedTags.map((t) => ({
          tagId: t.id, assetId: t.asset.id, title: t.asset.title, fileType: t.asset.fileType, confidence: t.confidence,
        }))}
      />

      {assets.length === 0 ? (
        <div className="empty-state card">
          <h3>No confirmed photos yet</h3>
          <p>Photos will appear here once face matches are confirmed.</p>
        </div>
      ) : (
        <>
          <AssetGallery assets={assets} metaMode="date" />
          {pages > 1 && (
            <div className="pagination">
              <a
                href={`/players/${player.id}?page=${page - 1}`}
                className="btn-secondary"
                style={{ pointerEvents: page <= 1 ? 'none' : 'auto', opacity: page <= 1 ? 0.4 : 1, textDecoration: 'none' }}
              >
                ← Prev
              </a>
              <span className="page-info">Page {page} of {pages} · {total} total</span>
              <a
                href={`/players/${player.id}?page=${page + 1}`}
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
