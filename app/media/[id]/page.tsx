import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '../../../lib/auth';
import { prisma } from '../../../lib/db';
import { getPresignedUrl } from '../../../lib/wasabi';
import { getCollectionNavContext } from '../../../lib/collections';
import AppShell from '../../../components/AppShell';
import AssetDetailClient from '../../../components/AssetDetailClient';

export default async function AssetDetailPage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ collectionId?: string }> }) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const asset = await prisma.asset.findUnique({
    where: { id: params.id },
    include: { season: true, collection: true },
  });
  if (!asset) notFound();

  const appBaseUrl = (process.env.PUBLIC_SHARE_BASE_URL ?? process.env.APP_BASE_URL ?? '').replace(/\/$/, '');

  // Present only when reached from a collection's asset gallery (?collectionId=) — drives the
  // prev/next arrows and breadcrumb below. Falls back to no nav if the id is stale/deleted or the
  // asset no longer belongs to that collection's resolved membership.
  const collectionId = searchParams.collectionId || '';
  const navContext = collectionId ? await getCollectionNavContext(collectionId) : null;
  const navIndex = navContext ? navContext.assetIds.indexOf(asset.id) : -1;
  const nav = navContext && navIndex !== -1 ? {
    collectionId,
    collectionName: navContext.name,
    position: navIndex + 1,
    total: navContext.assetIds.length,
    prevHref: navIndex > 0 ? `/media/${navContext.assetIds[navIndex - 1]}?collectionId=${collectionId}` : null,
    nextHref: navIndex < navContext.assetIds.length - 1 ? `/media/${navContext.assetIds[navIndex + 1]}?collectionId=${collectionId}` : null,
  } : null;

  const [seasons, collections, stadiums, players, sponsors, playerTags, sponsorTags, customCollectionMemberships, signedUrl] = await Promise.all([
    prisma.season.findMany({ orderBy: { startDate: 'desc' }, select: { id: true, name: true } }),
    prisma.collection.findMany({ orderBy: { date: 'desc' }, select: { id: true, name: true, type: true, date: true, seasonId: true } }),
    prisma.stadium.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.player.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, number: true } }),
    prisma.sponsor.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    // A player/sponsor can be confirmed via more than one source (face + jersey-ocr, or
    // logo + ocr-text) for the same asset — distinct collapses those to one row per player/sponsor.
    prisma.assetPlayerTag.findMany({ where: { assetId: params.id, status: 'confirmed' }, select: { playerId: true }, distinct: ['playerId'] }),
    prisma.assetSponsorTag.findMany({ where: { assetId: params.id, status: 'confirmed' }, select: { sponsorId: true }, distinct: ['sponsorId'] }),
    prisma.collectionAsset.findMany({ where: { assetId: params.id }, select: { collectionId: true } }),
    getPresignedUrl(asset.editedKey ?? asset.objectKey),
  ]);

  return (
    <AppShell user={user} wide>
      <div className="breadcrumb">
        {nav ? (
          <Link href={`/collections/${nav.collectionId}`}>{nav.collectionName}</Link>
        ) : (
          <Link href="/media">Media Library</Link>
        )}
        <span className="breadcrumb-sep">›</span>
        <span>{asset.title || asset.eventName || asset.objectKey.split('/').pop()}</span>
      </div>

      <AssetDetailClient
        nav={nav}
        stadiums={stadiums.map((s) => s.name)}
        asset={{
          id:              asset.id,
          title:           asset.title ?? '',
          description:     asset.description ?? '',
          shareText:       asset.shareText ?? '',
          eventName:       asset.eventName ?? '',
          eventDate:       asset.eventDate ? asset.eventDate.toISOString().split('T')[0] : '',
          location:        asset.location ?? '',
          category:        asset.category ?? '',
          seasonId:        asset.seasonId ?? '',
          collectionId:    asset.collectionId ?? '',
          fileType:        asset.fileType,
          fileSize:        asset.fileSize,
          uploadedAt:      asset.uploadedAt.toISOString(),
          objectKey:        asset.objectKey,
          uploaderEmail:    asset.uploaderEmail,
          manualTagsJson:   asset.manualTagsJson  ?? '[]',
          detectedTagsJson: asset.detectedTagsJson ?? null,
          exifJson:         asset.exifJson         ?? null,
          rating:           asset.rating           ?? null,
          reviewedAt:       asset.reviewedAt ? asset.reviewedAt.toISOString() : null,
          reviewedBy:       asset.reviewedBy        ?? null,
          editedKey:        asset.editedKey         ?? null,
          editParamsJson:   asset.editParamsJson    ?? null,
          isPublic:         asset.isPublic,
          shareToken:       asset.shareToken        ?? null,
          expiresAt:        asset.expiresAt ? asset.expiresAt.toISOString() : null,
        }}
        appBaseUrl={appBaseUrl}
        signedUrl={signedUrl}
        seasons={seasons}
        collections={collections}
        playerOptions={players.map((p) => ({ id: p.id, label: p.name + (p.number != null ? ` #${p.number}` : '') }))}
        sponsorOptions={sponsors.map((s) => ({ id: s.id, label: s.name }))}
        initialPlayerIds={playerTags.map((t) => t.playerId)}
        initialSponsorIds={sponsorTags.map((t) => t.sponsorId)}
        initialCustomCollectionIds={customCollectionMemberships.map((m) => m.collectionId)}
      />
    </AppShell>
  );
}
