import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';
import { detectPlayerNamesOnly } from '../../../../lib/rekognition';
import { removeConfirmedStringTag } from '../../../../lib/asset-tags';

function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

// Assets are processed in bounded batches, ordered by id, with the caller driving pagination via
// `cursor` — a single request against the full backlog (each asset needs a Wasabi download plus a
// Rekognition call) can run well past Vercel's function timeout. Batch size is small enough that
// even a slow run comfortably finishes inside that limit with room to spare.
const BATCH_SIZE = 25;
const CONCURRENCY = 5;

// One-off cleanup: player identification no longer matches by jersey NUMBER (see
// lib/rekognition.ts's detectJerseyIdentifiers) — only face recognition and printed-surname OCR.
// Existing AssetPlayerTag rows with source='jersey-ocr' predate that change and may have been
// created from a number-only match the current pipeline would no longer produce. This re-checks
// such tags against name-only OCR and hard-deletes any that no longer match. Idempotent — a tag
// that survives a check stays 'jersey-ocr' and would just be re-verified (not re-deleted) if this
// runs again — so it's safe to call more than once, including retrying after a failed batch.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const cursor: string | undefined = typeof body?.cursor === 'string' ? body.cursor : undefined;

  const assetIdRows = await prisma.assetPlayerTag.findMany({
    where: { source: 'jersey-ocr', ...(cursor ? { assetId: { gt: cursor } } : {}) },
    distinct: ['assetId'],
    orderBy: { assetId: 'asc' },
    take: BATCH_SIZE,
    select: { assetId: true },
  });
  const assetIds = assetIdRows.map((r) => r.assetId);

  if (assetIds.length === 0) {
    return NextResponse.json({ done: true, nextCursor: null, deleted: 0, kept: 0, failedAssetIds: [] });
  }

  const tags = await prisma.assetPlayerTag.findMany({
    where: { source: 'jersey-ocr', assetId: { in: assetIds } },
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

  const entries = [...byAsset.entries()];
  for (let i = 0; i < entries.length; i += CONCURRENCY) {
    const chunk = entries.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map(async ([assetId, { objectKey, tags: assetTags }]) => {
      let nameMatched: Set<string>;
      try {
        nameMatched = await detectPlayerNamesOnly(objectKey);
      } catch (err) {
        console.error(`[remove-number-only-jersey-tags] detection failed for asset ${assetId}:`, err);
        failedAssetIds.push(assetId);
        return;
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
    }));
  }

  const nextCursor = assetIds[assetIds.length - 1];
  return NextResponse.json({
    done: assetIds.length < BATCH_SIZE,
    nextCursor,
    assetsChecked: assetIds.length,
    deleted,
    kept,
    failedAssetIds,
  });
}
