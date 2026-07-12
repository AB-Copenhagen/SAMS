import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../../lib/auth';
import { prisma } from '../../../../../lib/db';
import { identifyPlayersInImage } from '../../../../../lib/rekognition';
import { upsertPlayerTag, upsertSponsorTag, addConfirmedStringTag } from '../../../../../lib/asset-tags';
import { matchSponsorTokens } from '../../../../../lib/sponsor-matching';

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
    const { faceMatches, jerseyMatches, detectedLines } = await identifyPlayersInImage(asset.objectKey);
    const playerNames = new Set<string>();
    const sponsorNames = new Set<string>();

    // All automated detections are applied immediately as confirmed tags — no review step —
    // so newly uploaded assets show their players/sponsors right away. Wrong tags get corrected
    // afterward via the existing manual multi-select / reject actions.
    for (const match of faceMatches) {
      await upsertPlayerTag(params.id, match.playerId, 'face', match.similarityPct / 100, 'confirmed');
      const player = await prisma.player.findUnique({ where: { id: match.playerId }, select: { name: true } });
      if (player) {
        playerNames.add(player.name);
        await addConfirmedStringTag(params.id, `player:${player.name.toLowerCase().replace(/\s+/g, '-')}`);
      }
    }

    for (const match of jerseyMatches) {
      await upsertPlayerTag(params.id, match.playerId, 'jersey-ocr', null, 'confirmed');
      const player = await prisma.player.findUnique({ where: { id: match.playerId }, select: { name: true } });
      if (player) {
        playerNames.add(player.name);
        await addConfirmedStringTag(params.id, `player:${player.name.toLowerCase().replace(/\s+/g, '-')}`);
      }
    }

    if (detectedLines.length > 0) {
      const sponsors = await prisma.sponsor.findMany({ where: { active: true }, select: { id: true, name: true, aliasesJson: true } });
      const sponsorMatches = matchSponsorTokens(detectedLines.join(' '), sponsors);
      for (const m of sponsorMatches) {
        await upsertSponsorTag(params.id, m.sponsorId, 'ocr-text', m.isFullName ? 1.0 : 0.6, 'confirmed');
        const sponsor = sponsors.find((s) => s.id === m.sponsorId);
        if (sponsor) {
          sponsorNames.add(sponsor.name);
          await addConfirmedStringTag(params.id, `sponsor:${sponsor.name.toLowerCase().replace(/\s+/g, '-')}`);
        }
      }
    }

    await prisma.asset.update({ where: { id: params.id }, data: { faceTagStatus: 'done' } });
    return NextResponse.json({ players: [...playerNames], sponsors: [...sponsorNames] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Player identification failed';
    console.error('[assets/tag-faces]', message);
    return NextResponse.json({ message }, { status: 502 });
  }
}
