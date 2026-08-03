import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';
import { detectPlayerNamesOnly } from '../../../../lib/rekognition';
import { removeConfirmedStringTag } from '../../../../lib/asset-tags';

function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

// One-off cleanup: player identification no longer matches by jersey NUMBER (see
// lib/rekognition.ts's detectJerseyIdentifiers) — only face recognition and printed-surname OCR.
// Existing AssetPlayerTag rows with source='jersey-ocr' predate that change and may have been
// created from a number-only match the current pipeline would no longer produce. This re-checks
// every such tag against name-only OCR and hard-deletes any that no longer match. Idempotent — a
// second run just finds nothing left to remove — so it's safe to click more than once.
export async function POST() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const tags = await prisma.assetPlayerTag.findMany({
    where: { source: 'jersey-ocr' },
    include: { asset: { select: { objectKey: true } }, player: { select: { name: true } } },
  });

  const byAsset = new Map<string, { objectKey: string; tags: typeof tags }>();
  for (const t of tags) {
    if (!byAsset.has(t.assetId)) byAsset.set(t.assetId, { objectKey: t.asset.objectKey, tags: [] });
    byAsset.get(t.assetId)!.tags.push(t);
  }

  let deleted = 0;
  let kept = 0;
  const failedAssetIds: string[] = [];

  for (const [assetId, { objectKey, tags: assetTags }] of byAsset) {
    let nameMatched: Set<string>;
    try {
      nameMatched = await detectPlayerNamesOnly(objectKey);
    } catch (err) {
      console.error(`[remove-number-only-jersey-tags] detection failed for asset ${assetId}:`, err);
      failedAssetIds.push(assetId);
      continue;
    }

    for (const t of assetTags) {
      if (nameMatched.has(t.playerId)) { kept++; continue; }

      await prisma.assetPlayerTag.delete({ where: { id: t.id } });
      const stillConfirmedElsewhere = await prisma.assetPlayerTag.count({
        where: { assetId, playerId: t.playerId, status: 'confirmed' },
      });
      if (stillConfirmedElsewhere === 0) {
        await removeConfirmedStringTag(assetId, `player:${slugify(t.player.name)}`);
      }
      deleted++;
    }
  }

  return NextResponse.json({ tagsChecked: tags.length, assetsChecked: byAsset.size, deleted, kept, failedAssetIds });
}
