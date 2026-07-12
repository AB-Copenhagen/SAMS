import sharp from 'sharp';
import { getPresignedUrl } from './wasabi';

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
