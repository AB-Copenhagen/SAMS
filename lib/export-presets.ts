import sharp from 'sharp';
import { getPresignedUrl, uploadFileToWasabi } from './wasabi';
import { prisma } from './db';

export interface ExportPreset {
  label: string;
  width: number;
  height?: number; // omitted for the aspect-preserving 'web' preset
}

export const EXPORT_PRESETS: Record<string, ExportPreset> = {
  web: { label: 'Web-optimized', width: 1920 },
  'instagram-square': { label: 'Instagram (square)', width: 1080, height: 1080 },
  'instagram-story': { label: 'Instagram (story)', width: 1080, height: 1920 },
  facebook: { label: 'Facebook', width: 1200, height: 630 },
  linkedin: { label: 'LinkedIn', width: 1200, height: 627 },
};

export async function renderExport(objectKey: string, presetKey: string): Promise<Buffer> {
  const preset = EXPORT_PRESETS[presetKey];
  if (!preset) throw new Error(`Unknown export preset: ${presetKey}`);

  const url = await getPresignedUrl(objectKey);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Wasabi download failed: ${res.status}`);
  const raw = Buffer.from(await res.arrayBuffer());

  let pipeline = sharp(raw).rotate();

  if (preset.height) {
    // The user already framed their own crop in the editor — 'centre' respects that framing
    // instead of a saliency heuristic silently re-cropping content they deliberately kept.
    pipeline = pipeline.resize(preset.width, preset.height, { fit: 'cover', position: 'centre' });
  } else {
    pipeline = pipeline.resize({ width: preset.width, withoutEnlargement: true });
  }

  return pipeline.jpeg({ quality: 90 }).toBuffer();
}

/**
 * Persists a 'web' preset render to a deterministic key — caches the lightbox/gallery preview
 * image, which used to be a fresh multi-second sharp resize of the full original on every single
 * view (same image, every visitor, never reused). Only 'web' is cached this way; the other
 * social-format presets are one-off downloads, not a repeatedly-viewed hot path.
 */
export async function generateWebPreview(objectKey: string): Promise<string> {
  const buffer = await renderExport(objectKey, 'web');
  const webPreviewKey = `previews/web/${objectKey}.jpg`;
  await uploadFileToWasabi(webPreviewKey, buffer, 'image/jpeg');
  return webPreviewKey;
}

/** Self-heals a missing cache (e.g. an asset uploaded before this existed) on first request. */
export async function ensureWebPreviewKey(asset: { id: string; objectKey: string; editedKey: string | null; webPreviewKey: string | null; fileType: string }): Promise<string> {
  if (asset.webPreviewKey) return asset.webPreviewKey;
  const sourceKey = asset.editedKey ?? asset.objectKey;
  if (!asset.fileType.startsWith('image/')) return sourceKey;

  try {
    const webPreviewKey = await generateWebPreview(sourceKey);
    await prisma.asset.update({ where: { id: asset.id }, data: { webPreviewKey } });
    return webPreviewKey;
  } catch (err) {
    console.error('[export-presets] on-demand web preview generation failed:', err);
    return sourceKey;
  }
}
