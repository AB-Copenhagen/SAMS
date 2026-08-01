import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';
import { deletePlayerFace } from '../../../../lib/rekognition';
import { addConfirmedStringTag, removeConfirmedStringTag } from '../../../../lib/asset-tags';

function normalizeName(name: string): string {
  return name.replace(/[‘’]/g, "'").trim().replace(/\s+/g, ' ').toLowerCase();
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

// One-time cleanup: the ab.dk squad-page scraper used to dedupe players by an exact string match
// on `name`, so a name re-scraped with a different apostrophe encoding (straight vs. curly quote —
// ab.dk's CMS isn't consistent) failed to match the existing row and created a duplicate Player
// instead of updating it (see the normalizeName fix in app/api/players/import/route.ts). This
// finds any players that now normalize to the same name, merges their asset tags and collection
// rules onto one surviving record, and deletes the duplicate(s). Idempotent — safe to re-run.
export async function POST() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const players = await prisma.player.findMany({
    include: { _count: { select: { assetTags: true } } },
  });

  const groups = new Map<string, typeof players>();
  for (const p of players) {
    const key = normalizeName(p.name);
    const list = groups.get(key) ?? [];
    list.push(p);
    groups.set(key, list);
  }

  let playersDeleted = 0;
  let tagsReassigned = 0;
  let tagsDropped = 0;
  const mergedNames: string[] = [];

  for (const group of groups.values()) {
    if (group.length < 2) continue;

    // Prefer keeping the record with an enrolled face, then the one with the most existing tags,
    // then the oldest (first-created) record — in that order.
    const [keeper, ...losers] = [...group].sort((a, b) => {
      if (!!b.rekognitionFaceId !== !!a.rekognitionFaceId) return (b.rekognitionFaceId ? 1 : 0) - (a.rekognitionFaceId ? 1 : 0);
      if (b._count.assetTags !== a._count.assetTags) return b._count.assetTags - a._count.assetTags;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    for (const loser of losers) {
      const loserStringTag = `player:${slugify(loser.name)}`;
      const keeperStringTag = `player:${slugify(keeper.name)}`;

      const loserTags = await prisma.assetPlayerTag.findMany({ where: { playerId: loser.id } });
      const affectedAssetIds = new Set(loserTags.map((t) => t.assetId));

      for (const tag of loserTags) {
        const conflict = await prisma.assetPlayerTag.findUnique({
          where: { assetId_playerId_source: { assetId: tag.assetId, playerId: keeper.id, source: tag.source } },
        });
        if (conflict) {
          // Keeper already has a tag for this asset+source — keep whichever is further along
          // (confirmed beats suggested), then drop the now-redundant duplicate row.
          if (conflict.status !== 'confirmed' && tag.status === 'confirmed') {
            await prisma.assetPlayerTag.update({ where: { id: conflict.id }, data: { status: 'confirmed', confidence: tag.confidence } });
          }
          await prisma.assetPlayerTag.delete({ where: { id: tag.id } });
          tagsDropped++;
        } else {
          await prisma.assetPlayerTag.update({ where: { id: tag.id }, data: { playerId: keeper.id } });
          tagsReassigned++;
        }
      }

      // Same conflict-or-move handling for "player must appear in this collection" rules.
      const loserRules = await prisma.collectionPlayerRule.findMany({ where: { playerId: loser.id } });
      for (const rule of loserRules) {
        const conflict = await prisma.collectionPlayerRule.findUnique({
          where: { collectionId_playerId: { collectionId: rule.collectionId, playerId: keeper.id } },
        });
        if (conflict) {
          await prisma.collectionPlayerRule.delete({ where: { id: rule.id } });
        } else {
          await prisma.collectionPlayerRule.update({ where: { id: rule.id }, data: { playerId: keeper.id } });
        }
      }

      // Reconcile the free-text search cache: every asset that referenced the duplicate's name
      // should reference the keeper's canonical name instead.
      for (const assetId of affectedAssetIds) {
        await removeConfirmedStringTag(assetId, loserStringTag);
        const stillConfirmed = await prisma.assetPlayerTag.findFirst({
          where: { assetId, playerId: keeper.id, status: 'confirmed' },
        });
        if (stillConfirmed) await addConfirmedStringTag(assetId, keeperStringTag);
      }

      if (loser.rekognitionFaceId) await deletePlayerFace(loser.rekognitionFaceId).catch(() => {});
      await prisma.player.delete({ where: { id: loser.id } });
      playersDeleted++;
    }

    mergedNames.push(keeper.name);
  }

  return NextResponse.json({ playersDeleted, tagsReassigned, tagsDropped, mergedNames });
}
