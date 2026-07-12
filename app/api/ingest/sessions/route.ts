import { NextResponse } from 'next/server';
import { getIngestActor } from '../../../../lib/device-auth';
import { prisma } from '../../../../lib/db';
import { createMultipartUpload, getPresignedUploadUrl, MULTIPART_MIN_PART_SIZE, MULTIPART_THRESHOLD } from '../../../../lib/wasabi';
import { sanitizeObjectKey, isMediaType } from '../../../../lib/ingest';

export async function POST(request: Request) {
  const actor = await getIngestActor(request);
  if (!actor) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });

  const { fileName, fileType, fileSize, contentHash, channel, metadata } = body as {
    fileName?: string;
    fileType?: string;
    fileSize?: number;
    contentHash?: string;
    channel?: string;
    metadata?: Record<string, unknown>;
  };

  if (!fileName || !fileType || !fileSize) {
    return NextResponse.json({ message: 'fileName, fileType, and fileSize are required' }, { status: 400 });
  }
  if (!isMediaType(fileType)) {
    return NextResponse.json({ message: 'Only images and videos are allowed' }, { status: 400 });
  }

  // Pre-transfer dedup — if the caller knows the content hash, check before allocating any storage.
  if (contentHash) {
    const existing = await prisma.asset.findUnique({ where: { contentHash }, select: { id: true } });
    if (existing) {
      return NextResponse.json({ status: 'duplicate', existingAssetId: existing.id });
    }
  }

  const objectKey = sanitizeObjectKey(fileName);
  const deviceId = 'deviceId' in actor ? (actor as { deviceId?: string }).deviceId : undefined;

  if (fileSize > MULTIPART_THRESHOLD) {
    const uploadId = await createMultipartUpload(objectKey, fileType);
    const partsTotal = Math.ceil(fileSize / MULTIPART_MIN_PART_SIZE);

    const job = await prisma.ingestJob.create({
      data: {
        deviceId, uploaderEmail: actor.email, uploaderRole: actor.role,
        channel: channel || 'browser', fileName, fileType, fileSize, contentHash,
        objectKey, uploadId, partSize: MULTIPART_MIN_PART_SIZE, partsTotal,
        status: 'uploading',
        metadataJson: metadata ? JSON.stringify(metadata) : null,
      },
    });

    return NextResponse.json({
      status: 'ok', mode: 'multipart', jobId: job.id, objectKey, uploadId,
      partSize: MULTIPART_MIN_PART_SIZE, partsTotal,
    });
  }

  const presignedUrl = await getPresignedUploadUrl(objectKey, fileType, 900);

  const job = await prisma.ingestJob.create({
    data: {
      deviceId, uploaderEmail: actor.email, uploaderRole: actor.role,
      channel: channel || 'browser', fileName, fileType, fileSize, contentHash,
      objectKey, status: 'uploading',
      metadataJson: metadata ? JSON.stringify(metadata) : null,
    },
  });

  return NextResponse.json({ status: 'ok', mode: 'single', jobId: job.id, objectKey, presignedUrl });
}
