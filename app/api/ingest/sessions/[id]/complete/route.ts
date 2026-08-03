import { NextResponse } from 'next/server';
import { getIngestActor } from '../../../../../../lib/device-auth';
import { prisma } from '../../../../../../lib/db';
import { completeMultipartUpload, getPublicUrl, type UploadedPart } from '../../../../../../lib/wasabi';
import { canAccessJob, type IngestMetadata } from '../../../../../../lib/ingest';
import { publishJob } from '../../../../../../lib/qstash';
import { matchCollectionByCaptureDate, resolveEventFieldDefaults } from '../../../../../../lib/collections';

export const maxDuration = 60;

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const actor = await getIngestActor(request);
  if (!actor) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const job = await prisma.ingestJob.findUnique({ where: { id: params.id } });
  if (!job) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  if (!canAccessJob(actor, job)) return NextResponse.json({ message: 'Forbidden' }, { status: 403 });

  if (job.status !== 'uploading') {
    // Idempotent retry: if it already finished, just hand back the asset.
    if (job.assetId) return NextResponse.json({ status: 'ok', assetId: job.assetId, job });
    return NextResponse.json({ message: `Job is in status '${job.status}', cannot complete` }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const { parts, exifJson } = body as { parts?: UploadedPart[]; exifJson?: string | null };

  try {
    if (job.uploadId) {
      if (!parts?.length) {
        return NextResponse.json({ message: 'parts is required to complete a multipart upload' }, { status: 400 });
      }
      await completeMultipartUpload(job.objectKey, job.uploadId, parts);
    }
    // Single-shot uploads were already PUT directly to Wasabi by the client — nothing more to finalize there.

    await prisma.ingestJob.update({ where: { id: job.id }, data: { status: 'uploaded', partsCompleted: parts?.length ?? 0 } });
  } catch (err) {
    await prisma.ingestJob.update({
      where: { id: job.id },
      data: { status: 'failed', errorMessage: err instanceof Error ? err.message : String(err) },
    });
    return NextResponse.json({ message: 'Failed to finalize storage upload' }, { status: 500 });
  }

  const metadata: IngestMetadata = job.metadataJson ? JSON.parse(job.metadataJson) : {};
  const tags = Array.isArray(metadata.manualTags) ? metadata.manualTags : [];
  const title = metadata.title || job.fileName.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');

  // Mobile ingest has no collection/season picker at all, and bulk upload leaves it to whoever's
  // uploading — falls back to matching the shot's own EXIF capture time against a Collection's
  // date whenever nothing was picked manually.
  let collectionId = metadata.collectionId || null;
  if (!collectionId) {
    const matched = await matchCollectionByCaptureDate(exifJson ?? null);
    if (matched) collectionId = matched.collectionId;
  }
  const { eventName, eventDate, seasonId } = await resolveEventFieldDefaults(collectionId, {
    eventName: metadata.eventName || null,
    eventDate: metadata.eventDate ? new Date(metadata.eventDate) : null,
    seasonId: metadata.seasonId || null,
  });

  let asset;
  try {
    asset = await prisma.asset.create({
      data: {
        title,
        description: tags.join(', '),
        eventName,
        eventDate,
        location: metadata.location || null,
        objectKey: job.objectKey,
        contentHash: job.contentHash || null,
        assetUrl: getPublicUrl(job.objectKey),
        fileType: job.fileType,
        fileSize: job.fileSize,
        uploaderEmail: job.uploaderEmail,
        uploaderRole: job.uploaderRole,
        manualTagsJson: JSON.stringify(tags),
        collectionId,
        seasonId,
        exifJson: exifJson ?? null,
        faceTagStatus: job.fileType.startsWith('image/') ? 'pending' : 'skipped',
        thumbnailStatus: (job.fileType.startsWith('image/') || job.fileType.startsWith('video/')) ? 'pending' : 'skipped',
      },
    });
  } catch (err) {
    // Most likely cause: a race on the contentHash unique constraint (duplicate uploaded concurrently).
    await prisma.ingestJob.update({
      where: { id: job.id },
      data: { status: 'failed', errorMessage: err instanceof Error ? err.message : String(err) },
    });
    return NextResponse.json({ message: 'Database write failed: ' + (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }

  await prisma.ingestJob.update({
    where: { id: job.id },
    data: { status: 'complete', assetId: asset.id, completedAt: new Date() },
  });

  // Player/sponsor identification (Rekognition) and thumbnail generation both run out-of-band via
  // QStash jobs, tracked on the Asset itself (faceTagStatus/thumbnailStatus), not on this ingest
  // job. publishJob no-ops (with a warning) if QSTASH_TOKEN isn't configured — the reconciliation
  // sweep in the ingest cron picks up anything that doesn't get enqueued here.
  // Face/sponsor tagging is image-only (Rekognition's image APIs can't process video); thumbnail
  // generation covers both, since lib/video-thumbnail.ts handles the video branch.
  const isImage = job.fileType.startsWith('image/');
  const isVideo = job.fileType.startsWith('video/');
  const enqueueJobs: Promise<unknown>[] = [];
  if (isImage) {
    enqueueJobs.push(publishJob('/api/jobs/tag-asset', { assetId: asset.id }).catch((err) => console.error('[ingest/complete] failed to enqueue tag-asset job:', err)));
  }
  if (isImage || isVideo) {
    enqueueJobs.push(publishJob('/api/jobs/generate-thumbnail', { assetId: asset.id }).catch((err) => console.error('[ingest/complete] failed to enqueue generate-thumbnail job:', err)));
  }
  await Promise.all(enqueueJobs);

  return NextResponse.json({ status: 'ok', assetId: asset.id, job: { ...job, status: 'complete', assetId: asset.id } });
}
