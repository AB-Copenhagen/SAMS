import sharp from 'sharp';
import { getPresignedUrl } from './wasabi';

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PhotoFilter = 'grayscale' | 'sepia' | 'vivid' | null;

export interface EditParams {
  crop?: CropRect | null;
  brightness: number; // -100..100
  contrast: number;   // -100..100
  saturation: number; // -100..100
  filter: PhotoFilter;
  autoCorrect: boolean;
}

const SEPIA_MATRIX: [[number, number, number], [number, number, number], [number, number, number]] = [
  [0.393, 0.769, 0.189],
  [0.349, 0.686, 0.168],
  [0.272, 0.534, 0.131],
];

function toMultiplier(value: number): number {
  return 1 + value / 100;
}

// Applies the full edit pipeline to the pristine original and returns a re-encoded JPEG buffer.
// Order matters and must match the client's CSS preview filter order: crop → auto-correct →
// brightness → saturation → contrast → named filter.
export async function applyEdit(objectKey: string, params: EditParams): Promise<Buffer> {
  const url = await getPresignedUrl(objectKey);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Wasabi download failed: ${res.status}`);
  const raw = Buffer.from(await res.arrayBuffer());

  // rotate() bakes in EXIF orientation; resolveWithObject gives post-rotation dimensions in the
  // same call (without a second decode), so crop clamping below is against the correct
  // (possibly width/height-swapped) dimensions. No format is specified, so `data` comes back
  // re-encoded in the original format (still a decodable image buffer, not raw pixels).
  const { data, info } = await sharp(raw).rotate().toBuffer({ resolveWithObject: true });

  let pipeline = sharp(data)
    .flatten({ background: '#ffffff' }); // strip alpha defensively before .linear()/final JPEG encode

  if (params.crop) {
    const left = Math.max(0, Math.round(params.crop.x));
    const top = Math.max(0, Math.round(params.crop.y));
    const width = Math.min(info.width - left, Math.round(params.crop.width));
    const height = Math.min(info.height - top, Math.round(params.crop.height));
    pipeline = pipeline.extract({ left, top, width, height });
  }

  if (params.autoCorrect) {
    pipeline = pipeline.normalize();
  }

  const brightnessMult = toMultiplier(params.brightness);
  if (brightnessMult !== 1) {
    pipeline = pipeline.linear(brightnessMult, 0);
  }

  const saturationMult = toMultiplier(params.saturation);
  if (saturationMult !== 1) {
    pipeline = pipeline.modulate({ saturation: saturationMult });
  }

  const contrastMult = toMultiplier(params.contrast);
  if (contrastMult !== 1) {
    pipeline = pipeline.linear(contrastMult, 128 * (1 - contrastMult));
  }

  if (params.filter === 'grayscale') {
    pipeline = pipeline.grayscale();
  } else if (params.filter === 'sepia') {
    pipeline = pipeline.recomb(SEPIA_MATRIX);
  } else if (params.filter === 'vivid') {
    pipeline = pipeline.modulate({ saturation: 1.3 });
  }

  return pipeline.jpeg({ quality: 90 }).toBuffer();
}
