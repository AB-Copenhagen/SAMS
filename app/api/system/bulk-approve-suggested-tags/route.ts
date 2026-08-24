import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';
import { addConfirmedStringTag } from '../../../../lib/asset-tags';

// One-time cleanup: bulk-approve AI-suggested player/sponsor tags on image assets that have sat
// in the /review queue (REVIEWABLE_ASSET_WHERE in lib/asset-review.ts) for more than 3 days.
// Runs against production Turso the same way the other app/api/system/apply-* routes do — this
// has to run inside the deployed app because the Turso credentials only live in Vercel's prod
// env, not locally. GET previews what would change; POST commits it (confirms every 'suggested'
// tag on the qualifying assets, same effect as PATCH .../player-tags|sponsor-tags/[tagId], then
// stamps the asset's own reviewedAt/reviewedBy so it drops out of the queue). Run once against
// production, then delete this route.
const DEFAULT_OLDER_THAN_DAYS = 3;

function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

function cutoffFrom(request: Request): Date {
  const days = Number(new URL(request.url).searchParams.get('olderThanDays')) || DEFAULT_OLDER_THAN_DAYS;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function findQualifyingAssets(cutoff: Date) {
  return prisma.asset.findMany({
    where: {
      fileType: { startsWith: 'image/' },
      reviewedAt: null,
      faceTagStatus: { not: 'pending' },
      uploadedAt: { lte: cutoff },
    },
    orderBy: { uploadedAt: 'asc' },
    select: { id: true, title: true, uploadedAt: true },
  });
}

// Dry-run preview — reports which assets/tags would be touched.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const cutoff = cutoffFrom(request);
  const assets = await findQualifyingAssets(cutoff);
  const assetIds = assets.map((a) => a.id);

  const [playerTags, sponsorTags] = await Promise.all([
    prisma.assetPlayerTag.count({ where: { assetId: { in: assetIds }, status: 'suggested' } }),
    prisma.assetSponsorTag.count({ where: { assetId: { in: assetIds }, status: 'suggested' } }),
  ]);

  return NextResponse.json({
    cutoff: cutoff.toISOString(),
    assetsToClose: assets.length,
    playerTagsToConfirm: playerTags,
    sponsorTagsToConfirm: sponsorTags,
    assets: assets.map((a) => ({ id: a.id, title: a.title, uploadedAt: a.uploadedAt })),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const cutoff = cutoffFrom(request);
  const assets = await findQualifyingAssets(cutoff);
  const assetIds = assets.map((a) => a.id);
  if (assetIds.length === 0) {
    return NextResponse.json({ assetsClosed: 0, playerTagsConfirmed: 0, sponsorTagsConfirmed: 0 });
  }

  const now = new Date();

  const [playerTags, sponsorTags] = await Promise.all([
    prisma.assetPlayerTag.findMany({
      where: { assetId: { in: assetIds }, status: 'suggested' },
      include: { player: { select: { name: true } } },
    }),
    prisma.assetSponsorTag.findMany({
      where: { assetId: { in: assetIds }, status: 'suggested' },
      include: { sponsor: { select: { name: true } } },
    }),
  ]);

  for (const tag of playerTags) {
    await prisma.assetPlayerTag.update({
      where: { id: tag.id },
      data: { status: 'confirmed', reviewedAt: now, reviewedBy: user.email },
    });
    await addConfirmedStringTag(tag.assetId, `player:${slugify(tag.player.name)}`);
  }

  for (const tag of sponsorTags) {
    await prisma.assetSponsorTag.update({
      where: { id: tag.id },
      data: { status: 'confirmed', reviewedAt: now, reviewedBy: user.email },
    });
    await addConfirmedStringTag(tag.assetId, `sponsor:${slugify(tag.sponsor.name)}`);
  }

  await prisma.asset.updateMany({
    where: { id: { in: assetIds } },
    data: { reviewedAt: now, reviewedBy: user.email },
  });

  return NextResponse.json({
    assetsClosed: assetIds.length,
    playerTagsConfirmed: playerTags.length,
    sponsorTagsConfirmed: sponsorTags.length,
  });
}
