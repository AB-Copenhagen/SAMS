import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';
import { deleteFileFromWasabi } from '../../../../lib/wasabi';
import { syncPlayerTags, syncSponsorTags } from '../../../../lib/asset-tags';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const asset = await prisma.asset.findUnique({
    where: { id: params.id },
    include: { season: true, collection: true },
  });
  if (!asset) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  return NextResponse.json(asset);
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

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

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const asset = await prisma.asset.update({
    where: { id: params.id },
    data: {
      title:       body.title       ?? undefined,
      description: body.description ?? undefined,
      eventName:   body.eventName   ?? undefined,
      eventDate:   body.eventDate   ? new Date(body.eventDate) : null,
      location:    body.location    ?? undefined,
      category:    body.category    ?? undefined,
      seasonId:    body.seasonId    || null,
      collectionId: body.collectionId || null,
      manualTagsJson: body.manualTagsJson ?? undefined,
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
