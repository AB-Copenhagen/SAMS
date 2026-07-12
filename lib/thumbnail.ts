import sharp from 'sharp';
import { getPresignedUrl, uploadFileToWasabi } from './wasabi';

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
