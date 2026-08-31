import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth';
import { prisma } from '../../../../../lib/db';
import { syncPlayerTags, syncSponsorTags } from '../../../../../lib/asset-tags';
import { resolveEventFieldDefaults } from '../../../../../lib/collections';
import { invalidateUnreviewedCount } from '../../../../../lib/asset-review';

// Single fast-path action for the /review workflow: rate + sync tags + stamp the review log
// in one round trip, so rating an asset (click or 1-4 key) is a single network call.
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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

  const asset = await prisma.asset.findUnique({
    where: { id: params.id },
    select: { id: true, eventName: true, eventDate: true, seasonId: true },
  });
  if (!asset) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  await Promise.all([
    syncPlayerTags(params.id, playerIds, user.email),
    syncSponsorTags(params.id, sponsorIds, user.email),
  ]);

  // Same season/collectionId fields the asset detail page edits — setting a match here should
  // inherit its event name/date/season the same way, not leave them blank (resolveEventFieldDefaults).
  const collectionId: string | null | undefined = 'collectionId' in body ? (body.collectionId || null) : undefined;
  const seasonIdBody: string | null | undefined = 'seasonId' in body ? (body.seasonId || null) : undefined;
  const eventDefaults = collectionId !== undefined
    ? await resolveEventFieldDefaults(collectionId, {
        eventName: asset.eventName,
        eventDate: asset.eventDate,
        seasonId: seasonIdBody !== undefined ? seasonIdBody : asset.seasonId,
      })
    : null;

  const updated = await prisma.asset.update({
    where: { id: params.id },
    data: {
      manualTagsJson: JSON.stringify(tags),
      rating,
      reviewedAt: new Date(),
      reviewedBy: user.email,
      ...(collectionId !== undefined && { collectionId }),
      ...(eventDefaults
        ? { eventName: eventDefaults.eventName, eventDate: eventDefaults.eventDate, seasonId: eventDefaults.seasonId }
        : seasonIdBody !== undefined ? { seasonId: seasonIdBody } : {}),
    },
  });

  invalidateUnreviewedCount();

  return NextResponse.json(updated);
}
