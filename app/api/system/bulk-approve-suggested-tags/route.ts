import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';
import { addConfirmedStringTag } from '../../../../lib/asset-tags';
import { REVIEWABLE_ASSET_WHERE } from '../../../../lib/asset-review';

// Permanent safety-net for the AI tagging pipeline and for the review queue in general. The
// pipeline (lib/tagging-pipeline.ts, app/api/assets/[id]/tag-faces) auto-confirms every
// player/sponsor match it finds, so 'suggested' tags should no longer accumulate in normal
// operation — but plenty of assets land in /review with no suggested tags at all (nothing
// detected, or tags already confirmed) and just sit there waiting on a manual pass that isn't
// going to happen. This confirms every currently-suggested tag, then closes out the *entire*
// review queue (REVIEWABLE_ASSET_WHERE), not just the assets that had a suggested tag — that's
// what actually empties /review from the Jobs page's "Accept all suggested tags" button.
function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

// Preview — how many suggested tags exist right now, and how many assets are in the review queue.
export async function GET() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const [playerTags, sponsorTags, reviewQueueTotal] = await Promise.all([
    prisma.assetPlayerTag.count({ where: { status: 'suggested' } }),
    prisma.assetSponsorTag.count({ where: { status: 'suggested' } }),
    prisma.asset.count({ where: REVIEWABLE_ASSET_WHERE }),
  ]);

  return NextResponse.json({ playerTagsSuggested: playerTags, sponsorTagsSuggested: sponsorTags, reviewQueueTotal });
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

  const { count: assetsClosed } = await prisma.asset.updateMany({
    where: REVIEWABLE_ASSET_WHERE,
    data: { reviewedAt: now, reviewedBy: user.email },
  });

  return NextResponse.json({
    playerTagsConfirmed: playerTags.length,
    sponsorTagsConfirmed: sponsorTags.length,
    assetsClosed,
  });
}
