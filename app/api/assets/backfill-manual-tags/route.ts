import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';
import { upsertPlayerTag, upsertSponsorTag, addConfirmedStringTag } from '../../../../lib/asset-tags';

export const maxDuration = 60;

function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

// One-time backfill: before structured player/sponsor tagging existed, manually tagging an
// asset with a player/sponsor's name via the free-text tag suggestions just appended a plain
// string to manualTagsJson — no AssetPlayerTag/AssetSponsorTag row was ever created, so those
// photos never showed up on the player/sponsor pages. This scans existing manual tags and
// creates the missing structured rows. Idempotent — safe to re-run.
export async function POST() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const [players, sponsors] = await Promise.all([
    prisma.player.findMany({ where: { active: true }, select: { id: true, name: true } }),
    prisma.sponsor.findMany({ where: { active: true }, select: { id: true, name: true } }),
  ]);

  const assets = await prisma.asset.findMany({
    where: { manualTagsJson: { not: null } },
    select: { id: true, manualTagsJson: true },
  });

  let playerTagsAdded = 0;
  let sponsorTagsAdded = 0;

  for (const asset of assets) {
    let tags: string[];
    try {
      tags = JSON.parse(asset.manualTagsJson!);
    } catch {
      continue;
    }
    if (!Array.isArray(tags) || tags.length === 0) continue;

    for (const tag of tags) {
      const lower = tag.toLowerCase().trim();

      const player = players.find((p) => p.name.toLowerCase() === lower);
      if (player) {
        await upsertPlayerTag(asset.id, player.id, 'manual', null, 'confirmed');
        await addConfirmedStringTag(asset.id, `player:${slugify(player.name)}`);
        playerTagsAdded++;
        continue;
      }

      const sponsor = sponsors.find((s) => s.name.toLowerCase() === lower);
      if (sponsor) {
        await upsertSponsorTag(asset.id, sponsor.id, 'manual', null, 'confirmed');
        await addConfirmedStringTag(asset.id, `sponsor:${slugify(sponsor.name)}`);
        sponsorTagsAdded++;
      }
    }
  }

  return NextResponse.json({ scanned: assets.length, playerTagsAdded, sponsorTagsAdded });
}
