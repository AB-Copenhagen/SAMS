import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';
import { deletePlayerFace } from '../../../../lib/rekognition';
import { addConfirmedStringTag, removeConfirmedStringTag } from '../../../../lib/asset-tags';
import { normalizePlayerName, decodeHtmlEntities } from '../../../../lib/player-name';

function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

// One-time cleanup: the ab.dk squad-page scraper used to dedupe players by an exact string match
// on `name`, so a name re-scraped with any different punctuation (straight vs. curly quote, a
// dropped apostrophe — ab.dk's CMS isn't consistent) failed to match the existing row and created
// a duplicate Player instead of updating it (now fixed in app/api/players/import/route.ts, which
// also matches on the stable siPlayerId once a record has one). This finds any players that still
// normalize to the same name — stripping ALL punctuation, not just apostrophes, since we don't
// know in advance which character differed — merges their asset tags and collection rules onto
// one surviving record, and deletes the duplicate(s). Idempotent — safe to re-run.
export async function POST() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const players = await prisma.player.findMany({
    include: { _count: { select: { assetTags: true } } },
  });

  // Some rows predate the scraper's HTML-entity decoding (or were entered by hand with raw
  // markup pasted in) and still have literal "&#039;"-style text baked into `name`. Clean those up
  // unconditionally, not just when a duplicate is found, since a singleton with no sibling to
  // merge against would otherwise keep displaying the raw entity forever.
  for (const p of players) {
    const decoded = decodeHtmlEntities(p.name);
    if (decoded !== p.name) {
      await prisma.player.update({ where: { id: p.id }, data: { name: decoded } });
      p.name = decoded;
    }
  }

  const groups = new Map<string, typeof players>();
  for (const p of players) {
    const key = normalizePlayerName(p.name);
    const list = groups.get(key) ?? [];
    list.push(p);
    groups.set(key, list);
  }

  let playersDeleted = 0;
  let tagsReassigned = 0;
  let tagsDropped = 0;
  const mergedNames: string[] = [];
  const skippedConflicts: string[] = [];

  for (const group of groups.values()) {
    if (group.length < 2) continue;

    // Prefer keeping the record with a confirmed SI ID (it's the one a recent scrape actually
    // matched, so its data is current), then the one with an enrolled face, then the one with the
    // most existing tags, then the oldest (first-created) record — in that order.
    const [keeper, ...candidates] = [...group].sort((a, b) => {
      if (!!b.siPlayerId !== !!a.siPlayerId) return (b.siPlayerId ? 1 : 0) - (a.siPlayerId ? 1 : 0);
      if (!!b.rekognitionFaceId !== !!a.rekognitionFaceId) return (b.rekognitionFaceId ? 1 : 0) - (a.rekognitionFaceId ? 1 : 0);
      if (b._count.assetTags !== a._count.assetTags) return b._count.assetTags - a._count.assetTags;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    // Same normalized name but explicitly different squad numbers on both sides reads as two
    // different real players (e.g. an unrelated same-surname signing), not a scrape duplicate —
    // leave those alone rather than guessing.
    const losers = candidates.filter((c) => {
      const conflicts = keeper.number != null && c.number != null && keeper.number !== c.number;
      if (conflicts) skippedConflicts.push(`${c.name} (#${c.number} vs. keeper #${keeper.number})`);
      return !conflicts;
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

  return NextResponse.json({ playersDeleted, tagsReassigned, tagsDropped, mergedNames, skippedConflicts });
}
