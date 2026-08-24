import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';
import { deleteFileFromWasabi } from '../../../../lib/wasabi';
import { syncPlayerTags, syncSponsorTags } from '../../../../lib/asset-tags';
import { generateShareToken, resolveEventFieldDefaults } from '../../../../lib/collections';

export async function GET(_: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const asset = await prisma.asset.findUnique({
    where: { id: params.id },
    include: { season: true, collection: true },
  });
  if (!asset) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  return NextResponse.json(asset);
}

export async function DELETE(_: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const asset = await prisma.asset.findUnique({ where: { id: params.id }, select: { objectKey: true } });
  if (!asset) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  await prisma.asset.delete({ where: { id: params.id } });

  try {
    await deleteFileFromWasabi(asset.objectKey);
  } catch (err) {
    console.warn('[delete] Wasabi removal failed (DB record already deleted):', err);
  }

  return NextResponse.json({ success: true });
}

export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const body = await request.json();

  let ratingUpdate: { rating?: number | null; reviewedAt?: Date; reviewedBy?: string } = {};
  if ('rating' in body && (body.rating === null || typeof body.rating === 'number')) {
    const existing = await prisma.asset.findUnique({ where: { id: params.id }, select: { rating: true } });
    ratingUpdate = { rating: body.rating };
    if (existing && existing.rating !== body.rating && typeof body.rating === 'number') {
      // Manual rating corrections (e.g. from the asset detail page, after the review queue has
      // already passed this asset by) re-stamp who/when just like the original review did.
      ratingUpdate.reviewedAt = new Date();
      ratingUpdate.reviewedBy = user.email;
    }
  }

  const collectionId = body.collectionId || null;
  const { eventName, eventDate, seasonId } = await resolveEventFieldDefaults(collectionId, {
    eventName: body.eventName || null,
    eventDate: body.eventDate ? new Date(body.eventDate) : null,
    seasonId: body.seasonId || null,
  });

  const asset = await prisma.asset.update({
    where: { id: params.id },
    data: {
      title:       body.title       ?? undefined,
      description: body.description ?? undefined,
      shareText:   body.shareText   ?? undefined,
      eventName,
      eventDate,
      location:    body.location    ?? undefined,
      category:    body.category    ?? undefined,
      seasonId,
      collectionId,
      manualTagsJson: body.manualTagsJson ?? undefined,
      ...ratingUpdate,
    },
    include: { season: true, collection: true },
  });

  if (Array.isArray(body.playerIds)) {
    await syncPlayerTags(params.id, body.playerIds, user.email);
  }
  if (Array.isArray(body.sponsorIds)) {
    await syncSponsorTags(params.id, body.sponsorIds, user.email);
  }

  return NextResponse.json(asset);
}

type SharePatchBody = {
  isPublic?: boolean;
  regenerateToken?: boolean;
  expiresAt?: string | null;
};

// Standalone per-asset public link — independent of PUT above, which handles the full metadata
// edit form. Mirrors the Collection sharing PATCH in app/api/collections/[id]/route.ts, minus
// password support (an individual asset link is a plain magic URL by design).
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const body = await request.json() as SharePatchBody;

  const existing = await prisma.asset.findUnique({ where: { id: params.id }, select: { shareToken: true } });
  if (!existing) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  const needsToken = (body.isPublic === true || body.regenerateToken) && (body.regenerateToken || !existing.shareToken);

  const asset = await prisma.asset.update({
    where: { id: params.id },
    data: {
      ...(body.isPublic !== undefined && { isPublic: body.isPublic }),
      ...(needsToken && { shareToken: generateShareToken() }),
      ...(body.expiresAt !== undefined && { expiresAt: body.expiresAt ? new Date(body.expiresAt) : null }),
      ...((body.isPublic !== undefined || needsToken) && { shareUpdatedAt: new Date() }),
    },
  });
  return NextResponse.json(asset);
}
