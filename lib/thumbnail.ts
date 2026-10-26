import sharp from 'sharp';
import { getPresignedUrl, getPresignedUrls, uploadFileToWasabi } from './wasabi';
import { prisma } from './db';

const THUMBNAIL_WIDTH = 400;
const THUMBNAIL_QUALITY = 70;

export async function generateThumbnail(objectKey: string): Promise<string> {
  const url = await getPresignedUrl(objectKey);
  const res = await fetch(url);
  const raw = Buffer.from(await res.arrayBuffer());

  const thumbnail = await sharp(raw)
    .rotate()
    .resize({ width: THUMBNAIL_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: THUMBNAIL_QUALITY })
    .toBuffer();

  const thumbnailKey = `thumbnails/${objectKey}.jpg`;
  await uploadFileToWasabi(thumbnailKey, thumbnail, 'image/jpeg');
  return thumbnailKey;
}

/**
 * Resolves the object key a thumbnail route should actually serve — generating and persisting
 * one on the fly if it's missing, rather than ever falling back to the full-size original. The
 * background job (lib/tagging-pipeline.ts's processThumbnail) can leave an asset stuck without a
 * key indefinitely: 'pending' only gets swept for stale jobs in batches, and 'failed' has no
 * retry path at all (app/api/jobs/failed/route.ts) — both would otherwise mean every viewer's
 * "thumbnail" request downloads the multi-MB original instead. Video posters need ffmpeg/Sandbox,
 * too heavy to generate inline here, so a still-missing video thumbnail just serves the original
 * (callers should avoid requesting this before thumbnailStatus is 'done' for video).
 */
export async function ensureThumbnailKey(asset: { id: string; objectKey: string; thumbnailKey: string | null; fileType: string }): Promise<string> {
  if (asset.thumbnailKey) return asset.thumbnailKey;
  if (!asset.fileType.startsWith('image/')) return asset.objectKey;

  try {
    const thumbnailKey = await generateThumbnail(asset.objectKey);
    await prisma.asset.update({ where: { id: asset.id }, data: { thumbnailKey, thumbnailStatus: 'done' } });
    return thumbnailKey;
  } catch (err) {
    console.error('[thumbnail] on-demand generation failed:', err);
    return asset.objectKey;
  }
}

/**
 * Attaches a presigned `thumbnailUrl` to each asset that already has a thumbnailKey, via one
 * batched getPresignedUrls call instead of a DB lookup + presign per gallery card (see
 * components/AssetThumbnail.tsx — the old per-image /api/assets/[id]/thumbnail route did a
 * Turso round trip for every single thumbnail on the page). Assets missing a thumbnailKey (not
 * yet processed) or a not-yet-posterized video are left without thumbnailUrl and fall back to
 * that same on-demand route, which still handles on-the-fly generation for those rare cases.
 */
export async function attachThumbnailUrls<T extends { fileType: string; thumbnailKey: string | null; thumbnailStatus: string }>(
  assets: T[],
): Promise<(T & { thumbnailUrl?: string })[]> {
  const keys = assets
    .filter((a) => a.thumbnailKey && (a.fileType.startsWith('image/') || a.thumbnailStatus === 'done'))
    .map((a) => a.thumbnailKey as string);
  if (keys.length === 0) return assets;

  const urls = await getPresignedUrls(keys);
  return assets.map((a) => (a.thumbnailKey && urls[a.thumbnailKey] ? { ...a, thumbnailUrl: urls[a.thumbnailKey] } : a));
}
