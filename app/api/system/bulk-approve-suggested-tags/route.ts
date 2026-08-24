import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';
import { addConfirmedStringTag } from '../../../../lib/asset-tags';

// Permanent safety-net for the AI tagging pipeline: the pipeline (lib/tagging-pipeline.ts,
// app/api/assets/[id]/tag-faces) now auto-confirms every player/sponsor match it finds, so
// 'suggested' tags should no longer accumulate in normal operation. This exists as an admin-only
// on-demand backstop — e.g. if a future pipeline change reintroduces a 'suggested' path, or to
// clear out a one-off manual match import — rather than needing per-tag review via
// TagReviewList/app/players/[id]/app/sponsors/[id]. Confirms every currently-suggested tag and
// stamps reviewedAt/reviewedBy on any asset that had one, so it also drops out of /review.
function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

// Preview — how many suggested tags exist right now.
export async function GET() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const [playerTags, sponsorTags] = await Promise.all([
    prisma.assetPlayerTag.count({ where: { status: 'suggested' } }),
    prisma.assetSponsorTag.count({ where: { status: 'suggested' } }),
  ]);

  return NextResponse.json({ playerTagsSuggested: playerTags, sponsorTagsSuggested: sponsorTags });
}

export async function POST() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const now = new Date();

  const [playerTags, sponsorTags] = await Promise.all([
    prisma.assetPlayerTag.findMany({
      where: { status: 'suggested' },
      include: { player: { select: { name: true } } },
    }),
    prisma.assetSponsorTag.findMany({
      where: { status: 'suggested' },
      include: { sponsor: { select: { name: true } } },
    }),
  ]);

  const affectedAssetIds = new Set<string>();

  for (const tag of playerTags) {
    await prisma.assetPlayerTag.update({
      where: { id: tag.id },
      data: { status: 'confirmed', reviewedAt: now, reviewedBy: user.email },
    });
    await addConfirmedStringTag(tag.assetId, `player:${slugify(tag.player.name)}`);
    affectedAssetIds.add(tag.assetId);
  }

  for (const tag of sponsorTags) {
    await prisma.assetSponsorTag.update({
      where: { id: tag.id },
      data: { status: 'confirmed', reviewedAt: now, reviewedBy: user.email },
    });
    await addConfirmedStringTag(tag.assetId, `sponsor:${slugify(tag.sponsor.name)}`);
    affectedAssetIds.add(tag.assetId);
  }

  if (affectedAssetIds.size > 0) {
    await prisma.asset.updateMany({
      where: { id: { in: [...affectedAssetIds] }, reviewedAt: null },
      data: { reviewedAt: now, reviewedBy: user.email },
    });
  }

  return NextResponse.json({
    playerTagsConfirmed: playerTags.length,
    sponsorTagsConfirmed: sponsorTags.length,
    assetsClosed: affectedAssetIds.size,
  });
}
