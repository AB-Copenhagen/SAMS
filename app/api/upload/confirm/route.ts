import { NextResponse } from 'next/server';
import { getCurrentUser } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';
import { getPublicUrl } from '../../../../lib/wasabi';
import { tagAssetWithWasbai } from '../../../../lib/wasbai';

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });

  const {
    objectKey, fileName, fileType, fileSize,
    title, eventName, eventDate, location,
    manualTags, collectionId, seasonId, exifJson,
  } = body as {
    objectKey?: string;
    fileName?: string;
    fileType?: string;
    fileSize?: number;
    title?: string;
    eventName?: string;
    eventDate?: string;
    location?: string;
    manualTags?: string[];
    collectionId?: string;
    seasonId?: string;
    exifJson?: string | null;
  };

  if (!objectKey || !fileType || !fileSize) {
    return NextResponse.json({ message: 'objectKey, fileType, and fileSize are required' }, { status: 400 });
  }

  const assetUrl = getPublicUrl(objectKey);
  const tags = Array.isArray(manualTags) ? manualTags : [];
  const resolvedTitle = title || (fileName ? fileName.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ') : '');

  const tagResult = await tagAssetWithWasbai(assetUrl, {
    objectKey, fileType,
    title: resolvedTitle, eventName, eventDate, location, manualTags: tags, uploader: user.email,
  });

  let asset;
  try {
    asset = await prisma.asset.create({
      data: {
        title: resolvedTitle,
        description: tags.join(', '),
        eventName:   eventName   || null,
        eventDate:   eventDate   ? new Date(eventDate) : null,
        location:    location    || null,
        objectKey,
        assetUrl,
        fileType,
        fileSize:    Number(fileSize),
        uploaderEmail: user.email,
        uploaderRole:  user.role,
        manualTagsJson:    JSON.stringify(tags),
        detectedTagsJson:  JSON.stringify(tagResult?.detectedTags ?? []),
        wasbaiResponseJson: JSON.stringify(tagResult ?? {}),
        collectionId: collectionId || null,
        seasonId:     seasonId    || null,
        exifJson:     exifJson ?? null,
      },
    });
  } catch (err) {
    console.error('[upload/confirm] DB write failed:', err);
    return NextResponse.json(
      { message: 'Database write failed: ' + (err instanceof Error ? err.message : String(err)) },
      { status: 500 }
    );
  }

  console.log('[upload/confirm] asset created:', asset.id);
  return NextResponse.json({ success: true, asset });
}
