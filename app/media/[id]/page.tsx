import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '../../../lib/auth';
import { prisma } from '../../../lib/db';
import { getPresignedUrl } from '../../../lib/wasabi';
import AppShell from '../../../components/AppShell';
import AssetDetailClient from '../../../components/AssetDetailClient';

export default async function AssetDetailPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const asset = await prisma.asset.findUnique({
    where: { id: params.id },
    include: { season: true, collection: true },
  });
  if (!asset) notFound();

  const [seasons, collections, stadiums, players, sponsors, playerTags, sponsorTags, signedUrl] = await Promise.all([
    prisma.season.findMany({ orderBy: { startDate: 'desc' }, select: { id: true, name: true } }),
    prisma.collection.findMany({ orderBy: { date: 'desc' }, select: { id: true, name: true, type: true, date: true } }),
    prisma.stadium.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.player.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, number: true } }),
    prisma.sponsor.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    // A player/sponsor can be confirmed via more than one source (face + jersey-ocr, or
    // logo + ocr-text) for the same asset — distinct collapses those to one row per player/sponsor.
    prisma.assetPlayerTag.findMany({ where: { assetId: params.id, status: 'confirmed' }, select: { playerId: true }, distinct: ['playerId'] }),
    prisma.assetSponsorTag.findMany({ where: { assetId: params.id, status: 'confirmed' }, select: { sponsorId: true }, distinct: ['sponsorId'] }),
    getPresignedUrl(asset.objectKey),
  ]);

  return (
    <AppShell user={user}>
      <div className="breadcrumb">
        <Link href="/media">Media Library</Link>
        <span className="breadcrumb-sep">›</span>
        <span>{asset.title || asset.eventName || asset.objectKey.split('/').pop()}</span>
      </div>

      <AssetDetailClient
        stadiums={stadiums.map((s) => s.name)}
        asset={{
          id:              asset.id,
          title:           asset.title ?? '',
          description:     asset.description ?? '',
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
        }}
        signedUrl={signedUrl}
        seasons={seasons}
        collections={collections}
        playerOptions={players.map((p) => ({ id: p.id, label: p.name + (p.number != null ? ` #${p.number}` : '') }))}
        sponsorOptions={sponsors.map((s) => ({ id: s.id, label: s.name }))}
        initialPlayerIds={playerTags.map((t) => t.playerId)}
        initialSponsorIds={sponsorTags.map((t) => t.sponsorId)}
      />
    </AppShell>
  );
}
