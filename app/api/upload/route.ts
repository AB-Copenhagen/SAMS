import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../lib/auth';
import { uploadFileToWasabi } from '../../../lib/wasabi';
import { tagAssetWithWasbai } from '../../../lib/wasbai';
import { prisma } from '../../../lib/db';

function parseFormField(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

export async function POST(request: Request) {
  console.log('[upload] request received');

  const user = await getCurrentUser();
  console.log('[upload] auth result:', user ? `${user.email} (${user.role})` : 'null — UNAUTHORIZED');
  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  console.log('[upload] file:', file ? `${file.name} ${file.type} ${file.size}B` : 'null');

  if (!file || !file.name) {
    return NextResponse.json({ message: 'File upload is required.' }, { status: 400 });
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

  const asset = await prisma.asset.create({
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

  console.log('[upload] DB record created:', asset.id);
  return NextResponse.json({ success: true, asset });
}
