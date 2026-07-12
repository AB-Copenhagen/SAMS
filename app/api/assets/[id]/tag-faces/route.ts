import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth';
import { prisma } from '../../../../../lib/db';
import { identifyPlayersInImage, AUTO_APPLY_THRESHOLD } from '../../../../../lib/rekognition';
import { upsertPlayerTag, addConfirmedStringTag } from '../../../../../lib/asset-tags';

export const maxDuration = 60;

// Synchronous, single-asset player identification (face + jersey number) — the on-demand
// counterpart to the cron's batched sweep. Triggered by "Auto-tag with AI" so a user gets an
// immediate result on click instead of waiting for the next cron pass.
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const asset = await prisma.asset.findUnique({ where: { id: params.id }, select: { objectKey: true, fileType: true } });
  if (!asset) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  if (!asset.fileType.startsWith('image/')) {
    return NextResponse.json({ message: 'Player identification is only supported for images' }, { status: 422 });
  }

  try {
    const { faceMatches, jerseyMatches } = await identifyPlayersInImage(asset.objectKey);
    const playerNames = new Set<string>();

    for (const match of faceMatches) {
      const status = match.similarityPct >= AUTO_APPLY_THRESHOLD ? 'confirmed' : 'suggested';
      await upsertPlayerTag(params.id, match.playerId, 'face', match.similarityPct / 100, status);
      const player = await prisma.player.findUnique({ where: { id: match.playerId }, select: { name: true } });
      if (player) {
        playerNames.add(player.name);
        if (status === 'confirmed') {
          await addConfirmedStringTag(params.id, `player:${player.name.toLowerCase().replace(/\s+/g, '-')}`);
        }
      }
    }

    for (const match of jerseyMatches) {
      const status = match.grounded ? 'confirmed' : 'suggested';
      await upsertPlayerTag(params.id, match.playerId, 'jersey-ocr', null, status);
      const player = await prisma.player.findUnique({ where: { id: match.playerId }, select: { name: true } });
      if (player) {
        playerNames.add(player.name);
        if (status === 'confirmed') {
          await addConfirmedStringTag(params.id, `player:${player.name.toLowerCase().replace(/\s+/g, '-')}`);
        }
      }
    }

    await prisma.asset.update({ where: { id: params.id }, data: { faceTagStatus: 'done' } });
    return NextResponse.json({ players: [...playerNames] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Player identification failed';
    console.error('[assets/tag-faces]', message);
    return NextResponse.json({ message }, { status: 502 });
  }
}
