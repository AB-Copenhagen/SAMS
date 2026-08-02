import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';
import { removeConfirmedStringTag } from '../../../../lib/asset-tags';

// One-time cleanup for commit 3d007ee ("Stop tagging players from background numbers unless
// clearly on a jersey"): before that fix, every jersey-OCR match was auto-confirmed regardless of
// whether the number/name was actually grounded near a person, so background signage (e.g. a
// "1889" founding-year banner) could get auto-confirmed as a player tag. There's no stored
// grounded flag to re-check after the fact, so this clears every never-human-reviewed confirmed
// jersey-ocr tag created before that fix landed. Anything a human already reviewed (reviewedBy
// set, via the asset page's player multi-select) is left untouched, as are 'suggested'/'rejected'
// rows — only re-running detection (not this route) can properly re-evaluate those.
const STRICTNESS_FIX_CUTOFF = new Date('2026-08-01T17:00:46+02:00');

const STALE_WHERE = {
  source: 'jersey-ocr',
  status: 'confirmed',
  reviewedBy: null,
  createdAt: { lt: STRICTNESS_FIX_CUTOFF },
} as const;

// Dry-run preview — same WHERE clause as the POST below, read-only.
export async function GET() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const count = await prisma.assetPlayerTag.count({ where: STALE_WHERE });
  return NextResponse.json({ wouldDelete: count });
}

export async function POST() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const stale = await prisma.assetPlayerTag.findMany({
    where: STALE_WHERE,
    include: { player: { select: { name: true } } },
  });

  // The free-text `player:<slug>` tag on Asset.detectedTagsJson only needs clearing if this
  // was the only confirmed source tagging that player on that asset (mirrors syncPlayerTags'
  // toRemove handling).
  let freeTextTagsRemoved = 0;
  for (const tag of stale) {
    const stillConfirmedElsewhere = await prisma.assetPlayerTag.findFirst({
      where: { assetId: tag.assetId, playerId: tag.playerId, status: 'confirmed', NOT: { source: 'jersey-ocr' } },
    });
    if (!stillConfirmedElsewhere) {
      await removeConfirmedStringTag(tag.assetId, `player:${tag.player.name.toLowerCase().replace(/\s+/g, '-')}`);
      freeTextTagsRemoved++;
    }
  }

  const { count } = await prisma.assetPlayerTag.deleteMany({ where: STALE_WHERE });

  return NextResponse.json({ tagsDeleted: count, freeTextTagsRemoved });
}
