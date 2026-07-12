import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../../../lib/auth';
import { prisma } from '../../../../../../lib/db';
import { addConfirmedStringTag } from '../../../../../../lib/asset-tags';

function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; tagId: string } },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const status = body?.status as string | undefined;
  if (status !== 'confirmed' && status !== 'rejected') {
    return NextResponse.json({ message: "status must be 'confirmed' or 'rejected'" }, { status: 400 });
  }

  const tag = await prisma.assetPlayerTag.findUnique({
    where: { id: params.tagId },
    include: { player: { select: { name: true } } },
  });
  if (!tag || tag.assetId !== params.id) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }

  const updated = await prisma.assetPlayerTag.update({
    where: { id: params.tagId },
    data: { status, reviewedAt: new Date(), reviewedBy: user.email },
  });

  // The same player can be suggested for this asset via more than one source (e.g. face +
  // jersey-ocr) — settle every other still-'suggested' sighting of this player on this asset to
  // the same verdict, so reviewing one doesn't leave a duplicate suggestion behind.
  await prisma.assetPlayerTag.updateMany({
    where: { assetId: params.id, playerId: tag.playerId, status: 'suggested', id: { not: params.tagId } },
    data: { status, reviewedAt: new Date(), reviewedBy: user.email },
  });

  const stringTag = `player:${slugify(tag.player.name)}`;
  if (status === 'confirmed') {
    await addConfirmedStringTag(params.id, stringTag);
  } else {
    const asset = await prisma.asset.findUnique({ where: { id: params.id }, select: { detectedTagsJson: true } });
    if (asset?.detectedTagsJson) {
      const tags: string[] = JSON.parse(asset.detectedTagsJson).filter((t: string) => t !== stringTag);
      await prisma.asset.update({ where: { id: params.id }, data: { detectedTagsJson: JSON.stringify(tags) } });
    }
  }

  return NextResponse.json(updated);
}
