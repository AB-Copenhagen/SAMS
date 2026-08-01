import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';
import { deletePlayerFace } from '../../../../lib/rekognition';
import { addConfirmedStringTag, removeConfirmedStringTag } from '../../../../lib/asset-tags';
import { normalizePlayerName, decodeHtmlEntities } from '../../../../lib/player-name';

function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

type PlayerRow = {
  id: string;
  name: string;
  number: number | null;
  siPlayerId: string | null;
  rekognitionFaceId: string | null;
  createdAt: Date;
  _count: { assetTags: number };
};

// Prefer keeping the record with a confirmed SI ID (it's the one a recent scrape actually
// matched, so its data is current), then the one with an enrolled face, then the one with the
// most existing tags, then the oldest (first-created) record — in that order.
function pickKeeper(group: PlayerRow[]): [PlayerRow, ...PlayerRow[]] {
  const [keeper, ...rest] = [...group].sort((a, b) => {
    if (!!b.siPlayerId !== !!a.siPlayerId) return (b.siPlayerId ? 1 : 0) - (a.siPlayerId ? 1 : 0);
    if (!!b.rekognitionFaceId !== !!a.rekognitionFaceId) return (b.rekognitionFaceId ? 1 : 0) - (a.rekognitionFaceId ? 1 : 0);
    if (b._count.assetTags !== a._count.assetTags) return b._count.assetTags - a._count.assetTags;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  return [keeper, ...rest];
}

async function mergeLoserIntoKeeper(
  keeper: PlayerRow,
  loser: PlayerRow,
  counters: { tagsReassigned: number; tagsDropped: number },
): Promise<void> {
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
      counters.tagsDropped++;
    } else {
      await prisma.assetPlayerTag.update({ where: { id: tag.id }, data: { playerId: keeper.id } });
      counters.tagsReassigned++;
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
}

function nameWords(name: string): Set<string> {
  return new Set(normalizePlayerName(name).split(' ').filter(Boolean));
}

function isSubset(a: Set<string>, b: Set<string>): boolean {
  return a.size > 0 && [...a].every((w) => b.has(w));
}

// One-time cleanup for players that survived scraping as duplicates. Two known causes, handled in
// two passes:
//
// 1. The ab.dk squad-page scraper used to dedupe by an exact string match on `name`, so a name
//    re-scraped with different punctuation (straight vs. curly quote, a dropped apostrophe) or a
//    stray undecoded HTML entity ("O&#039;Vonte" vs. "O'Vonte") failed to match the existing row
//    and created a duplicate instead of updating it (now fixed in app/api/players/import/route.ts,
//    which also matches on the stable siPlayerId once a record has one). Pass 1 groups players by
//    a normalized name — decoded entities, all punctuation stripped — and merges each group.
//
// 2. A genuine name variant (e.g. "Noah Engell" vs. "Noah Engell Christensen" — full legal name
//    vs. the name ab.dk actually prints) isn't a punctuation difference, so pass 1 won't catch it,
//    and blindly fuzzy-matching names is too risky in general (could merge two unrelated players
//    who share a surname). Pass 2 only merges a pair when their squad number matches AND one
//    name's words are wholly contained in the other's — safe because both signals have to agree.
//
// Idempotent — safe to re-run.
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

  const counters = { tagsReassigned: 0, tagsDropped: 0 };
  let playersDeleted = 0;
  const mergedNames: string[] = [];
  const skippedConflicts: string[] = [];
  const survivorIds = new Set(players.map((p) => p.id));

  // Pass 1: exact normalized-name match.
  const exactGroups = new Map<string, PlayerRow[]>();
  for (const p of players) {
    const key = normalizePlayerName(p.name);
    const list = exactGroups.get(key) ?? [];
    list.push(p);
    exactGroups.set(key, list);
  }

  for (const group of exactGroups.values()) {
    if (group.length < 2) continue;

    const [keeper, ...candidates] = pickKeeper(group);

    // Same normalized name but explicitly different squad numbers on both sides reads as two
    // different real players (e.g. an unrelated same-surname signing), not a scrape duplicate —
    // leave those alone rather than guessing.
    const losers = candidates.filter((c) => {
      const conflicts = keeper.number != null && c.number != null && keeper.number !== c.number;
      if (conflicts) skippedConflicts.push(`${c.name} (#${c.number} vs. keeper #${keeper.number})`);
      return !conflicts;
    });

    for (const loser of losers) {
      await mergeLoserIntoKeeper(keeper, loser, counters);
      survivorIds.delete(loser.id);
      playersDeleted++;
    }
    if (losers.length > 0) mergedNames.push(keeper.name);
  }

  // Pass 2: same squad number + one name's words fully contained in the other's (name-variant
  // duplicates that pass 1's exact match can't see). Only consider players pass 1 didn't already
  // resolve, grouped by number since two different real players sharing a jersey number is
  // exactly the ambiguous case this must not guess through.
  const remaining = players.filter((p) => survivorIds.has(p.id));
  const byNumber = new Map<number, PlayerRow[]>();
  for (const p of remaining) {
    if (p.number == null) continue;
    const list = byNumber.get(p.number) ?? [];
    list.push(p);
    byNumber.set(p.number, list);
  }

  for (const group of byNumber.values()) {
    if (group.length < 2) continue;

    const words = new Map(group.map((p) => [p.id, nameWords(p.name)] as const));
    // Connect any pair where one name's words are a subset of the other's, then merge each
    // connected component — handles a chain like "Noah" ⊂ "Noah Engell" ⊂ "Noah Engell Christensen"
    // without requiring every pair to relate directly.
    const parent = new Map(group.map((p) => [p.id, p.id] as const));
    function find(id: string): string {
      let root = id;
      while (parent.get(root) !== root) root = parent.get(root)!;
      return root;
    }
    function union(a: string, b: string) {
      const ra = find(a), rb = find(b);
      if (ra !== rb) parent.set(ra, rb);
    }
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i], b = group[j];
        if (isSubset(words.get(a.id)!, words.get(b.id)!) || isSubset(words.get(b.id)!, words.get(a.id)!)) {
          union(a.id, b.id);
        }
      }
    }

    const components = new Map<string, PlayerRow[]>();
    for (const p of group) {
      const root = find(p.id);
      const list = components.get(root) ?? [];
      list.push(p);
      components.set(root, list);
    }

    for (const component of components.values()) {
      if (component.length < 2) continue;
      const [keeper, ...losers] = pickKeeper(component);
      for (const loser of losers) {
        await mergeLoserIntoKeeper(keeper, loser, counters);
        survivorIds.delete(loser.id);
        playersDeleted++;
      }
      mergedNames.push(keeper.name);
    }
  }

  return NextResponse.json({
    playersDeleted,
    tagsReassigned: counters.tagsReassigned,
    tagsDropped: counters.tagsDropped,
    mergedNames,
    skippedConflicts,
  });
}
