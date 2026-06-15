import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../lib/auth';
import { uploadFileToWasabi } from '../../../lib/wasabi';
import { tagAssetWithWasbai } from '../../../lib/wasbai';
import { prisma } from '../../../lib/db';

function parseFormField(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

// Vercel Hobby plan caps request bodies at 4.5 MB — warn callers before they hit a 413.
const VERCEL_BODY_LIMIT_BYTES = 4.5 * 1024 * 1024;

export const maxDuration = 60;

export async function POST(request: Request) {
  console.log('[upload] request received');

  const user = await getCurrentUser();
  console.log('[upload] auth result:', user ? `${user.email} (${user.role})` : 'null — UNAUTHORIZED');
  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[upload] formData parse failed:', msg);
    return NextResponse.json(
      { message: 'Could not parse upload. If your file is larger than 4.5 MB, Vercel rejects it before it reaches the server. Try a smaller file or contact the administrator.', detail: msg },
      { status: 413 }
    );
  }

  const file = formData.get('file') as File | null;
  console.log('[upload] file:', file ? `${file.name} ${file.type} ${file.size}B` : 'null');

  if (!file || !file.name) {
    return NextResponse.json({ message: 'File upload is required.' }, { status: 400 });
  }

  if (file.size > VERCEL_BODY_LIMIT_BYTES) {
    console.warn('[upload] file too large:', file.size, 'bytes');
    return NextResponse.json(
      { message: `File is ${(file.size / 1024 / 1024).toFixed(1)} MB — Vercel's free plan limits uploads to 4.5 MB. Compress the file or ask the admin to enable direct-to-storage uploads.` },
      { status: 413 }
    );
  }

  if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
    console.log('[upload] rejected file type:', file.type);
    return NextResponse.json({ message: 'Only photos and videos are allowed.' }, { status: 400 });
  }

  const title       = parseFormField(formData, 'title');
  const eventName   = parseFormField(formData, 'eventName');
  const eventDate   = parseFormField(formData, 'eventDate');
  const location    = parseFormField(formData, 'location');
  const manualTagsRaw = parseFormField(formData, 'manualTags');
  let manualTags: string[] = [];
  try { manualTags = JSON.parse(manualTagsRaw); } catch { manualTags = manualTagsRaw.split(',').map((t) => t.trim()).filter(Boolean); }
  const collectionId = parseFormField(formData, 'collectionId') || null;
  const seasonId    = parseFormField(formData, 'seasonId') || null;

  const buffer = Buffer.from(await file.arrayBuffer());
  const objectKey = `assets/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9_\-.]/g, '_')}`;

  console.log('[upload] uploading key:', objectKey, `(${buffer.byteLength}B)`);

  let assetUrl: string;
  try {
    assetUrl = await uploadFileToWasabi(objectKey, buffer, file.type);
    console.log('[upload] wasabi upload OK, url:', assetUrl);
  } catch (err) {
    console.error('[upload] wasabi upload FAILED:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ message: 'Storage upload failed: ' + message }, { status: 500 });
  }

  // Extract EXIF data (images only)
  let exifJson: string | null = null;
  if (file.type.startsWith('image/')) {
    try {
      const { default: exifr } = await import('exifr');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const exif = await (exifr.parse as any)(buffer, { all: true });
      if (exif) exifJson = JSON.stringify(exif);
    } catch (err) {
      console.warn('[upload] EXIF extraction failed (non-fatal):', err);
    }
  }

  const tagResult = await tagAssetWithWasbai(assetUrl, {
    title, eventName, eventDate, location, manualTags, uploader: user.email,
  });

  let asset;
  try {
    asset = await prisma.asset.create({
      data: {
        title,
        description: manualTags.join(', '),
        eventName,
        eventDate:   eventDate ? new Date(eventDate) : null,
        location,
        objectKey,
        assetUrl,
        fileType:    file.type,
        fileSize:    buffer.byteLength,
        uploaderEmail: user.email,
        uploaderRole:  user.role,
        manualTagsJson:    JSON.stringify(manualTags),
        detectedTagsJson:  JSON.stringify(tagResult?.detectedTags ?? []),
        wasbaiResponseJson: JSON.stringify(tagResult ?? {}),
        collectionId,
        seasonId,
        exifJson,
      },
    });
  } catch (err) {
    console.error('[upload] DB write FAILED:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ message: 'Database write failed: ' + message }, { status: 500 });
  }

  console.log('[upload] DB record created:', asset.id);
  return NextResponse.json({ success: true, asset });
}
