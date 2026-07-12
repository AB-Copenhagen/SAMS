import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth';
import { prisma } from '../../../../../lib/db';
import { syncPlayerTags, syncSponsorTags } from '../../../../../lib/asset-tags';

// Single fast-path action for the /review workflow: rate + sync tags + stamp the review log
// in one round trip, so rating an asset (click or 1-4 key) is a single network call.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const rating = body?.rating;
  if (typeof rating !== 'number' || rating < 1 || rating > 4 || !Number.isInteger(rating)) {
    return NextResponse.json({ message: 'rating must be an integer 1-4' }, { status: 400 });
  }
  const playerIds: string[] = Array.isArray(body?.playerIds) ? body.playerIds : [];
  const sponsorIds: string[] = Array.isArray(body?.sponsorIds) ? body.sponsorIds : [];
  const tags: string[] = Array.isArray(body?.tags) ? body.tags : [];

  const asset = await prisma.asset.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!asset) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  await Promise.all([
    syncPlayerTags(params.id, playerIds, user.email),
    syncSponsorTags(params.id, sponsorIds, user.email),
  ]);

  const updated = await prisma.asset.update({
    where: { id: params.id },
    data: {
      manualTagsJson: JSON.stringify(tags),
      rating,
      reviewedAt: new Date(),
      reviewedBy: user.email,
    },
  });

  return NextResponse.json(updated);
}
